import type { PlanId } from './plans.js'
import type { BillingEvent } from './types.js'

/**
 * The one place a payment provider (Paddle, Stripe, Lemon Squeezy, ...) plugs in. Everything else
 * (the plans, the free exports, what a user may do) only sees this interface and the BillingEvents
 * it produces, so changing provider means writing one new implementation of it and choosing it in
 * providers/index.ts. See README.md next to this file.
 */
export interface PaymentProvider {
  /** Stored with what was bought, e.g. 'paddle'. */
  readonly id: string

  /** Whether plans can be bought through it (false for the 'none' provider). */
  readonly checkout: boolean

  /**
   * A hosted checkout page for `plan`. The provider must hand `uid` back in its webhooks (custom
   * data / client reference), since that is how a payment finds its user.
   */
  createCheckout(req: CheckoutRequest): Promise<CheckoutSession>

  /** The provider's page where the user manages or cancels what they bought, when it has one. */
  portalUrl(req: { customerId: string; returnUrl: string }): Promise<string | null>

  /**
   * Checks a webhook really came from the provider (its signature) and turns it into our events.
   * Throws when the signature is wrong; returns [] for webhooks we don't care about.
   */
  parseWebhook(req: { rawBody: Buffer; headers: Record<string, string | string[] | undefined> }): Promise<BillingEvent[]>
}

export interface CheckoutRequest {
  uid: string
  email?: string
  plan: PlanId
  /** This user's customer id at this provider, from an earlier purchase. */
  customerId?: string
  /** Where the checkout goes when it's paid, or left. */
  successUrl: string
  cancelUrl: string
}

export interface CheckoutSession {
  /** The page to send the user to. */
  url: string
  /**
   * Events that already happened (only the fake provider, which "pays" at once). A real provider
   * leaves this out and reports the payment through its webhook.
   */
  completed?: BillingEvent[]
}
