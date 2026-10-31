import { getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import { applyEvent, claimExport, emptyAccount, refundExport } from './entitlements.js'
import type { Account, BillingEvent } from './types.js'

/**
 * Firestore, written only from here:
 * - users/{uid}: the Account (plan, free exports used)
 * - users/{uid}/exports/{id}: one per export started: when, whether it was free, and how it ended
 *   (so a failed export gives its free export back once). Nothing about what was exported.
 * - billingEvents/{provider}_{id}: provider events already applied, so a retried webhook counts once.
 */

let db: Firestore | undefined
const firestore = () => {
  // By name: firebase-functions creates an app of its own (to check sign-in) before this runs.
  if (!getApps().some((a) => a.name === '[DEFAULT]')) initializeApp()
  return (db ??= getFirestore())
}

const userRef = (uid: string) => firestore().collection('users').doc(uid)
const asAccount = (data: FirebaseFirestore.DocumentData | undefined): Account => ({ ...emptyAccount(), ...(data as Partial<Account> | undefined) })

export async function getAccount(uid: string): Promise<Account> {
  return asAccount((await userRef(uid).get()).data())
}

export type ExportKind = 'set' | 'clip'

/** Spends an export (see claimExport); `null` when a free account has none left. */
export async function claim(uid: string, kind: ExportKind): Promise<{ id: string; account: Account } | null> {
  return firestore().runTransaction(async (tx) => {
    const ref = userRef(uid)
    const acc = asAccount((await tx.get(ref)).data())
    const now = Date.now()
    const r = claimExport(acc, now)
    if (!r) return null
    const exp = ref.collection('exports').doc()
    tx.set(ref, { ...r.account, updatedAt: now }, { merge: true })
    tx.set(exp, { kind, free: r.free, at: now, status: 'claimed' })
    return { id: exp.id, account: r.account }
  })
}

/** How an export ended: done, or failed/cancelled (a free one is given back). Each export settles once. */
export async function settle(uid: string, id: string, ok: boolean): Promise<Account> {
  return firestore().runTransaction(async (tx) => {
    const ref = userRef(uid)
    const exp = ref.collection('exports').doc(id)
    const [accSnap, expSnap] = await Promise.all([tx.get(ref), tx.get(exp)])
    let acc = asAccount(accSnap.data())
    const e = expSnap.data()
    if (!e || e.status !== 'claimed') return acc
    const now = Date.now()
    tx.update(exp, { status: ok ? 'done' : 'released', settledAt: now })
    if (!ok && e.free) {
      acc = refundExport(acc)
      tx.set(ref, { freeExportsUsed: acc.freeExportsUsed, updatedAt: now }, { merge: true })
    }
    return acc
  })
}

/** Applies a provider's event to its user, once however many times the webhook is retried. */
export async function recordEvent(e: BillingEvent): Promise<void> {
  await firestore().runTransaction(async (tx) => {
    const seen = firestore().collection('billingEvents').doc(`${e.provider}_${e.id}`.replace(/\//g, '_'))
    const ref = userRef(e.uid)
    const [seenSnap, accSnap] = await Promise.all([tx.get(seen), tx.get(ref)])
    if (seenSnap.exists) return
    const next = applyEvent(asAccount(accSnap.data()), e)
    tx.set(ref, { ...next, updatedAt: Date.now() })
    tx.set(seen, { kind: e.kind, uid: e.uid, at: Date.now() })
  })
}
