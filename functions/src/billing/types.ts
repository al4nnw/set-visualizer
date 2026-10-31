import type { Plan, PlanId } from './plans.js'

/**
 * A user's billing record, `users/{uid}` in Firestore. Only these functions write it (the rules
 * keep clients out). It holds nothing about what anyone exports: no set, file name or artwork.
 */
export interface Account {
  /** Free exports used so far (claimed and not given back). */
  freeExportsUsed: number
  /** Every export started, paid or free, for our own numbers. */
  exportsTotal: number
  subscription?: Subscription
  lifetime?: Lifetime
  /** The customer id each provider gave this user, for its billing portal. */
  customers?: Record<string, string>
}

export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled'

export interface Subscription {
  provider: string
  id: string
  status: SubscriptionStatus
  /** When the paid month ends (ms). A canceled subscription still works until then. */
  currentPeriodEnd: number
  /** Canceled by the user, but still paid until currentPeriodEnd. */
  cancelAtPeriodEnd?: boolean
  /** The provider's time for the last event applied (ms), so a late, older event can't undo a newer one. */
  updatedAt: number
}

export interface Lifetime {
  provider: string
  orderId: string
  purchasedAt: number
  refunded?: boolean
}

/**
 * What a payment provider tells us, in our words. Each provider turns its own webhooks into these
 * (see provider.ts), so nothing past the provider knows which one is in use.
 */
export type BillingEvent = { provider: string; /** The provider's event id, to apply each once. */ id: string; uid: string; customerId?: string; occurredAt: number } & (
  | { kind: 'subscription'; subscriptionId: string; status: SubscriptionStatus; currentPeriodEnd: number; cancelAtPeriodEnd?: boolean }
  | { kind: 'lifetime.purchased'; orderId: string }
  | { kind: 'lifetime.refunded'; orderId: string }
)

/** What the app is told about a user: what they can do, and what they could buy. */
export interface Entitlement {
  plan: 'free' | PlanId
  /** Exports without counting (a paid plan). */
  unlimited: boolean
  freeLimit: number
  freeUsed: number
  freeLeft: number
  /** Monthly: when it renews, or when it ends if canceled (ms). */
  periodEnd?: number
  cancelAtPeriodEnd?: boolean
  /** The provider has a page where this user can manage or cancel what they bought. */
  canManage: boolean
  plans: Plan[]
  /** A payment provider is set up, so the plans can be bought. */
  checkout: boolean
}
