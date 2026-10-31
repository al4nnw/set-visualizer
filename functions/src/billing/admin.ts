import { randomBytes } from 'node:crypto'
import { getAuth, type UserRecord } from 'firebase-admin/auth'
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https'
import { addBonusExports, entitlementOf, grantPlan, inviteProblem, lifetimeActive, MAX_GRANT_MONTHS, paidPlan, redeemInvite, subscriptionActive } from './entitlements.js'
import { isPlanId } from './plans.js'
import { paymentProvider } from './providers/index.js'
import { asAccount, firestore, userRef } from './store.js'
import type { Account, Invite } from './types.js'

/**
 * The back office: the owner lists the users and gives them free exports or a plan, and makes
 * invite links that give Lifetime to whoever claims them.
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
  /** The given plan came from this invite link. */
  grantedInvite?: string
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
    grantedInvite: acc.granted?.invite,
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

// ---------- invite links ----------

/** Letters and digits that can't be mistaken for each other when read aloud or typed. */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const newCode = () => Array.from(randomBytes(12), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('')
const isCode = (v: unknown): v is string => typeof v === 'string' && /^[A-Z0-9]{12}$/.test(v)
const inviteRef = (code: string) => firestore().collection('invites').doc(code)

/** One invite as the back office shows it. */
export interface AdminInvite extends Invite {
  code: string
}

/** `{ maxUses, label?, expiresInDays? }` → the new invite. Whoever claims it gets Lifetime. */
export const adminCreateInvite = onCall(opts, async (req) => {
  const by = await adminUid(req)
  const { maxUses, label, expiresInDays } = (req.data ?? {}) as { maxUses?: unknown; label?: unknown; expiresInDays?: unknown }
  if (typeof maxUses !== 'number' || !Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1000) throw new HttpsError('invalid-argument', 'maxUses')
  if (label !== undefined && (typeof label !== 'string' || label.length > 80)) throw new HttpsError('invalid-argument', 'label')
  if (expiresInDays !== undefined && (typeof expiresInDays !== 'number' || !Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 365))
    throw new HttpsError('invalid-argument', 'expiresInDays')
  const now = Date.now()
  const inv: Invite = {
    plan: 'lifetime',
    maxUses,
    uses: 0,
    createdBy: by,
    createdAt: now,
    ...(typeof label === 'string' && label.trim() ? { label: label.trim() } : {}),
    ...(expiresInDays ? { expiresAt: now + expiresInDays * 24 * 3600 * 1000 } : {})
  }
  const code = newCode()
  await inviteRef(code).create(inv)
  return { code, ...inv } satisfies AdminInvite
})

/** `{}` → `{ invites }`, newest first. */
export const adminListInvites = onCall(opts, async (req) => {
  await adminUid(req)
  const snap = await firestore().collection('invites').orderBy('createdAt', 'desc').limit(300).get()
  return { invites: snap.docs.map((d) => ({ code: d.id, ...(d.data() as Invite) }) satisfies AdminInvite) }
})

/** `{ code }`: the link stops working. Lifetime already claimed with it stays. → the invite. */
export const adminRevokeInvite = onCall(opts, async (req) => {
  const by = await adminUid(req)
  const code = (req.data as { code?: unknown })?.code
  if (!isCode(code)) throw new HttpsError('invalid-argument', 'code')
  const ref = inviteRef(code)
  const now = Date.now()
  await firestore().runTransaction(async (tx) => {
    if (!(await tx.get(ref)).exists) throw new HttpsError('not-found', 'invalid')
    tx.update(ref, { revoked: true })
    tx.set(firestore().collection('adminLog').doc(), { by, action: 'revokeInvite', code, at: now })
  })
  return { code, ...((await ref.get()).data() as Invite) } satisfies AdminInvite
})

/**
 * `{ code }`: the signed-in user claims an invite and gets Lifetime. Anyone signed in may call
 * it; the invite itself is the permission. → the user's entitlement. Fails with the reason
 * (`invalid`, `revoked`, `expired`, `used-up`, `already-lifetime`) as the message.
 */
export const redeemInviteLink = onCall(opts, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first')
  const uid = req.auth.uid
  const code = (req.data as { code?: unknown })?.code
  if (!isCode(code)) throw new HttpsError('not-found', 'invalid')
  const db = firestore()
  const acc = await db.runTransaction(async (tx) => {
    const ref = inviteRef(code)
    const mine = ref.collection('redemptions').doc(uid)
    const [invSnap, mineSnap, accSnap] = await Promise.all([tx.get(ref), tx.get(mine), tx.get(userRef(uid))])
    const acc = asAccount(accSnap.data())
    // Opening the same link again after claiming it just says it worked.
    if (mineSnap.exists) return acc
    const now = Date.now()
    const problem = inviteProblem(invSnap.data() as Invite | undefined, now)
    if (problem) throw new HttpsError(problem === 'invalid' ? 'not-found' : 'failed-precondition', problem)
    const next = redeemInvite(acc, code, now)
    if (!next) throw new HttpsError('already-exists', 'already-lifetime')
    tx.set(userRef(uid), { ...next, updatedAt: now })
    tx.update(ref, { uses: (invSnap.data() as Invite).uses + 1 })
    tx.set(mine, { at: now })
    return next
  })
  return entitlementOf(acc, Date.now(), { checkout: paymentProvider().checkout })
})
