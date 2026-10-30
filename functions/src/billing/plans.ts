/**
 * What the app sells. Prices are shown in the app as they are here; the payment provider charges
 * its own (localised) price for the same plan, so keep the two in step when a provider is added.
 */

/** Exports anyone signed in gets without paying, once (not per month). */
export const FREE_EXPORTS = 3

export type PlanId = 'monthly' | 'lifetime'

export interface Plan {
  id: PlanId
  /** In whole units of `currency`. */
  price: number
  currency: string
  /** Billed again every month; a lifetime plan is paid once. */
  interval: 'month' | null
}

export const PLANS: Plan[] = [
  { id: 'monthly', price: 10, currency: 'USD', interval: 'month' },
  { id: 'lifetime', price: 45, currency: 'USD', interval: null }
]

export const isPlanId = (v: unknown): v is PlanId => PLANS.some((p) => p.id === v)

/**
 * A subscription the provider says is late (a failed renewal it is still retrying) keeps working
 * this long past its period, so a card that needs a day to go through doesn't stop anyone's export.
 */
export const GRACE_MS = 3 * 24 * 3600 * 1000
