import { FREE_EXPORTS, GRACE_MS, PLANS, type PlanId } from './plans.js'
import type { Account, BillingEvent, Entitlement, Invite } from './types.js'

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

/** Whether an admin's gift of a plan still holds at `now`. */
export const grantActive = (acc: Account, now: number) => !!acc.granted && (acc.granted.plan === 'lifetime' || (acc.granted.until ?? 0) > now)

/** The plan that pays for exports at `now`, bought or given; null on the free exports. */
export function paidPlan(acc: Account, now: number): 'monthly' | 'lifetime' | null {
  const grant = grantActive(acc, now) ? acc.granted!.plan : null
  if (lifetimeActive(acc) || grant === 'lifetime') return 'lifetime'
  if (subscriptionActive(acc, now) || grant === 'monthly') return 'monthly'
  return null
}

/** Free exports this account gets: everyone's FREE_EXPORTS plus whatever an admin added. */
export const freeLimitOf = (acc: Account) => FREE_EXPORTS + Math.max(0, Math.floor(acc.bonusExports ?? 0))

export function entitlementOf(acc: Account, now: number, opts: { checkout: boolean }): Entitlement {
  const plan = paidPlan(acc, now)
  const monthly = plan === 'monthly'
  // A monthly plan the user pays for renews; one given by an admin only ends.
  const paying = monthly && subscriptionActive(acc, now)
  const freeUsed = Math.max(0, acc.freeExportsUsed)
  const freeLimit = freeLimitOf(acc)
  return {
    plan: plan ?? 'free',
    unlimited: !!plan,
    freeLimit,
    freeUsed: Math.min(freeUsed, freeLimit),
    freeLeft: Math.max(0, freeLimit - freeUsed),
    periodEnd: !monthly ? undefined : paying ? acc.subscription!.currentPeriodEnd : acc.granted!.until,
    cancelAtPeriodEnd: !monthly ? undefined : paying ? !!acc.subscription!.cancelAtPeriodEnd : true,
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
  const paid = !!paidPlan(acc, now)
  if (!paid && acc.freeExportsUsed >= freeLimitOf(acc)) return null
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

/**
 * Back office: gives `count` more free exports (a negative count takes them back, never below
 * none given). Exports already used stay used.
 */
export const addBonusExports = (acc: Account, count: number): Account => ({ ...acc, bonusExports: Math.max(0, Math.floor(acc.bonusExports ?? 0) + Math.trunc(count)) })

/** Longest monthly plan the back office gives in one go. */
export const MAX_GRANT_MONTHS = 24

/**
 * Back office: gives a plan without a payment (monthly for `months` from `now`, or lifetime), or
 * takes the given plan away (`free`). Anything the user bought through the provider is untouched:
 * that can only be cancelled or refunded there.
 */
export function grantPlan(acc: Account, plan: 'free' | PlanId, now: number, months = 1): Account {
  const next = { ...acc }
  if (plan === 'free') delete next.granted
  else if (plan === 'lifetime') next.granted = { plan, at: now }
  else {
    const m = Math.min(MAX_GRANT_MONTHS, Math.max(1, Math.floor(months)))
    const until = new Date(now)
    until.setUTCMonth(until.getUTCMonth() + m)
    next.granted = { plan, until: until.getTime(), at: now }
  }
  return next
}

/** Why an invite can't be claimed at `now`, or null when it can. */
export function inviteProblem(inv: Invite | undefined, now: number): 'invalid' | 'revoked' | 'expired' | 'used-up' | null {
  if (!inv) return 'invalid'
  if (inv.revoked) return 'revoked'
  if (inv.expiresAt !== undefined && now >= inv.expiresAt) return 'expired'
  if (inv.uses >= inv.maxUses) return 'used-up'
  return null
}

/**
 * Claiming an invite: the account gets Lifetime (noted as coming from that invite), or `null`
 * when it already has Lifetime, so a user who has it doesn't use up someone else's place.
 */
export function redeemInvite(acc: Account, code: string, now: number): Account | null {
  if (paidPlan(acc, now) === 'lifetime') return null
  return { ...acc, granted: { plan: 'lifetime', at: now, invite: code } }
}
