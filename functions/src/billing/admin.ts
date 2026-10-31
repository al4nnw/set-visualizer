import { getAuth, type UserRecord } from 'firebase-admin/auth'
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https'
import { addBonusExports, entitlementOf, grantPlan, lifetimeActive, MAX_GRANT_MONTHS, paidPlan, subscriptionActive } from './entitlements.js'
import { isPlanId } from './plans.js'
import { asAccount, firestore, userRef } from './store.js'
import type { Account } from './types.js'

/**
 * The back office: the owner lists the users and gives them free exports or a plan.
 *
 * Who is an admin is decided here, on the server, and nowhere else: a user is one when
 * `admins/{uid}` exists in Firestore. Nobody can write that from the app (the rules keep every
 * client out); it is added by hand in the Firebase console or with `npm run make-admin`. The app
 * only learns it to show the menu entry, and every call below checks it again.
 *
 * Like the rest of billing it sees accounts only: name, email, sign-up date, plan and export
 * counts. Nothing about what anyone exported.
 */

const opts = { region: 'southamerica-east1', maxInstances: 3 }

export async function isAdmin(uid: string): Promise<boolean> {
  return (await firestore().collection('admins').doc(uid).get()).exists
}

async function adminUid(req: CallableRequest): Promise<string> {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first')
  if (!(await isAdmin(req.auth.uid))) throw new HttpsError('permission-denied', 'Not an admin')
  return req.auth.uid
}

/** One row of the back office's user list. */
export interface AdminUser {
  uid: string
  name: string
  email: string
  photo?: string
  /** Sign-up and last sign-in (ms). */
  createdAt: number
  lastSignInAt?: number
  plan: 'free' | 'monthly' | 'lifetime'
  /** Where the plan comes from: bought through the payment provider, or given here. */
  planSource: 'paid' | 'granted' | null
  /** Given monthly plan: when it ends (ms). */
  grantedUntil?: number
  freeLimit: number
  freeUsed: number
  bonusExports: number
  exportsTotal: number
  admin: boolean
}

function row(u: UserRecord, acc: Account, admin: boolean, now: number): AdminUser {
  const e = entitlementOf(acc, now, { checkout: false })
  const plan = paidPlan(acc, now)
  const bought = plan === 'lifetime' ? lifetimeActive(acc) : plan === 'monthly' && subscriptionActive(acc, now)
  return {
    uid: u.uid,
    name: u.displayName ?? '',
    email: u.email ?? u.providerData[0]?.email ?? '',
    photo: u.photoURL,
    createdAt: Date.parse(u.metadata.creationTime),
    lastSignInAt: u.metadata.lastSignInTime ? Date.parse(u.metadata.lastSignInTime) : undefined,
    plan: plan ?? 'free',
    planSource: !plan ? null : bought ? 'paid' : 'granted',
    grantedUntil: acc.granted?.until,
    freeLimit: e.freeLimit,
    freeUsed: Math.max(0, acc.freeExportsUsed),
    bonusExports: Math.max(0, acc.bonusExports ?? 0),
    exportsTotal: acc.exportsTotal,
    admin
  }
}

async function rowsFor(users: UserRecord[]): Promise<AdminUser[]> {
  if (!users.length) return []
  const db = firestore()
  const [accs, admins] = await Promise.all([db.getAll(...users.map((u) => userRef(u.uid))), db.getAll(...users.map((u) => db.collection('admins').doc(u.uid)))])
  const now = Date.now()
  return users.map((u, i) => row(u, asAccount(accs[i].data()), admins[i].exists, now))
}

/** The most users the list shows, newest first. */
const LIST_MAX = 500

/** `{}` → `{ users, total }`: the newest users first (up to LIST_MAX), and how many there are. */
export const adminListUsers = onCall(opts, async (req) => {
  await adminUid(req)
  const all: UserRecord[] = []
  let pageToken: string | undefined
  do {
    const page = await getAuth().listUsers(1000, pageToken)
    all.push(...page.users)
    pageToken = page.pageToken
  } while (pageToken)
  all.sort((a, b) => Date.parse(b.metadata.creationTime) - Date.parse(a.metadata.creationTime))
  return { users: await rowsFor(all.slice(0, LIST_MAX)), total: all.length }
})

function targetUid(data: unknown): string {
  const uid = (data as { uid?: unknown })?.uid
  if (typeof uid !== 'string' || !/^[\w-]{1,128}$/.test(uid)) throw new HttpsError('invalid-argument', 'uid')
  return uid
}

/** Changes one user's account in a transaction, notes who did what, and returns the new row. */
async function change(by: string, uid: string, action: Record<string, unknown>, fn: (acc: Account, now: number) => Account): Promise<AdminUser> {
  const user = await getAuth()
    .getUser(uid)
    .catch(() => {
      throw new HttpsError('not-found', 'No such user')
    })
  const db = firestore()
  await db.runTransaction(async (tx) => {
    const ref = userRef(uid)
    const now = Date.now()
    const next = fn(asAccount((await tx.get(ref)).data()), now)
    tx.set(ref, { ...next, updatedAt: now })
    tx.set(db.collection('adminLog').doc(), { by, uid, ...action, at: now })
  })
  return (await rowsFor([user]))[0]
}

/** `{ uid, count }`: gives that many more free exports (negative takes back). → the user's row. */
export const adminAddExports = onCall(opts, async (req) => {
  const by = await adminUid(req)
  const uid = targetUid(req.data)
  const count = (req.data as { count?: unknown }).count
  if (typeof count !== 'number' || !Number.isInteger(count) || count === 0 || Math.abs(count) > 1000) throw new HttpsError('invalid-argument', 'count')
  return change(by, uid, { action: 'addExports', count }, (acc) => addBonusExports(acc, count))
})

/**
 * `{ uid, plan, months? }`: gives a plan without a payment (`monthly` for `months`, or
 * `lifetime`), or takes a given plan away (`free`). → the user's row.
 */
export const adminSetPlan = onCall(opts, async (req) => {
  const by = await adminUid(req)
  const uid = targetUid(req.data)
  const { plan, months } = req.data as { plan?: unknown; months?: unknown }
  if (plan !== 'free' && !isPlanId(plan)) throw new HttpsError('invalid-argument', 'plan')
  const m = months === undefined ? 1 : months
  if (typeof m !== 'number' || !Number.isInteger(m) || m < 1 || m > MAX_GRANT_MONTHS) throw new HttpsError('invalid-argument', 'months')
  return change(by, uid, { action: 'setPlan', plan, ...(plan === 'monthly' ? { months: m } : {}) }, (acc, now) => grantPlan(acc, plan, now, m))
})
