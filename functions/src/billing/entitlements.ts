import { FREE_EXPORTS, GRACE_MS, PLANS } from './plans.js'
import type { Account, BillingEvent, Entitlement } from './types.js'

/**
 * The rules, with no Firestore and no provider in them, so they can be tested on their own:
 * what an account may do, what an export costs it, and what a billing event changes.
 */

export const emptyAccount = (): Account => ({ freeExportsUsed: 0, exportsTotal: 0 })

/** Whether the monthly plan pays for exports at `now`. */
export function subscriptionActive(acc: Account, now: number): boolean {
  const s = acc.subscription
  if (!s) return false
  // A canceled one was paid up to its period end; a late one gets a few days' grace past it.
  const until = s.currentPeriodEnd + (s.status === 'canceled' ? 0 : GRACE_MS)
  return now < until
}

export const lifetimeActive = (acc: Account) => !!acc.lifetime && !acc.lifetime.refunded

export function entitlementOf(acc: Account, now: number, opts: { checkout: boolean }): Entitlement {
  const lifetime = lifetimeActive(acc)
  const monthly = !lifetime && subscriptionActive(acc, now)
  const freeUsed = Math.max(0, acc.freeExportsUsed)
  return {
    plan: lifetime ? 'lifetime' : monthly ? 'monthly' : 'free',
    unlimited: lifetime || monthly,
    freeLimit: FREE_EXPORTS,
    freeUsed: Math.min(freeUsed, FREE_EXPORTS),
    freeLeft: Math.max(0, FREE_EXPORTS - freeUsed),
    periodEnd: monthly ? acc.subscription!.currentPeriodEnd : undefined,
    cancelAtPeriodEnd: monthly ? !!acc.subscription!.cancelAtPeriodEnd : undefined,
    canManage: opts.checkout && !!(acc.subscription || acc.lifetime) && Object.keys(acc.customers ?? {}).length > 0,
    plans: PLANS,
    checkout: opts.checkout
  }
}

/**
 * Starting an export: a paid plan just counts it; a free account spends one of its free exports,
 * or is refused (`null`) when none are left.
 */
export function claimExport(acc: Account, now: number): { account: Account; free: boolean } | null {
  const paid = lifetimeActive(acc) || subscriptionActive(acc, now)
  if (!paid && acc.freeExportsUsed >= FREE_EXPORTS) return null
  return {
    free: !paid,
    account: { ...acc, exportsTotal: acc.exportsTotal + 1, freeExportsUsed: acc.freeExportsUsed + (paid ? 0 : 1) }
  }
}

/** An export that failed or was cancelled gives its free export back. */
export const refundExport = (acc: Account): Account => ({ ...acc, freeExportsUsed: Math.max(0, acc.freeExportsUsed - 1) })

/** The account after a provider's event (already known to be new, see store.ts). */
export function applyEvent(acc: Account, e: BillingEvent): Account {
  const next: Account = { ...acc, customers: e.customerId ? { ...acc.customers, [e.provider]: e.customerId } : acc.customers }
  if (!next.customers) delete next.customers
  switch (e.kind) {
    case 'subscription': {
      const cur = acc.subscription
      // Providers can send events out of order: an older one about the same subscription changes nothing.
      if (cur && cur.provider === e.provider && cur.id === e.subscriptionId && cur.updatedAt > e.occurredAt) return next
      return {
        ...next,
        subscription: {
          provider: e.provider,
          id: e.subscriptionId,
          status: e.status,
          currentPeriodEnd: e.currentPeriodEnd,
          ...(e.cancelAtPeriodEnd ? { cancelAtPeriodEnd: true } : {}),
          updatedAt: e.occurredAt
        }
      }
    }
    case 'lifetime.purchased':
      return { ...next, lifetime: { provider: e.provider, orderId: e.orderId, purchasedAt: e.occurredAt } }
    case 'lifetime.refunded':
      return acc.lifetime?.orderId === e.orderId ? { ...next, lifetime: { ...acc.lifetime, refunded: true } } : next
  }
}
