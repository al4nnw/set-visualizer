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
  /** Extra free exports an admin gave this user, on top of FREE_EXPORTS. */
  bonusExports?: number
  /** A plan an admin gave this user without a payment (see admin.ts). */
  granted?: Grant
}

/** A plan given by an admin: lifetime, or monthly until a date. It sits beside anything paid for. */
export interface Grant {
  plan: PlanId
  /** Monthly: when it ends (ms). Lifetime has no end. */
  until?: number
  /** When it was given (ms). */
  at: number
  /** The invite code it came from, when it came from an invite link rather than the back office. */
  invite?: string
}

/**
 * An invite link, `invites/{code}`: whoever opens it and signs in gets Lifetime, until it is used
 * up, expires or is revoked. Each user can claim a given invite once
 * (`invites/{code}/redemptions/{uid}`).
 */
export interface Invite {
  plan: 'lifetime'
  maxUses: number
  uses: number
  /** A note for the back office only, like who it was for. */
  label?: string
  createdBy: string
  createdAt: number
  expiresAt?: number
  revoked?: boolean
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
  /** This user may open the back office (only ever set by the server, see admin.ts). */
  admin?: boolean
}
