import { randomUUID } from 'node:crypto'
import type { PaymentProvider } from '../provider.js'

const MONTH_MS = 30 * 24 * 3600 * 1000

/**
 * A provider that "pays" the moment checkout starts, for trying the whole flow in the emulators
 * (index.ts refuses it anywhere else). The page it returns is the app's own success URL.
 */
export const fakeProvider: PaymentProvider = {
  id: 'fake',
  checkout: true,
  async createCheckout({ uid, plan, successUrl }) {
    const now = Date.now()
    const customerId = `fake_cus_${uid}`
    const base = { provider: 'fake', id: randomUUID(), uid, customerId, occurredAt: now }
    return {
      url: successUrl,
      completed: [
        plan === 'monthly'
          ? { ...base, kind: 'subscription', subscriptionId: `fake_sub_${uid}`, status: 'active', currentPeriodEnd: now + MONTH_MS }
          : { ...base, kind: 'lifetime.purchased', orderId: `fake_order_${randomUUID()}` }
      ]
    }
  },
  async portalUrl({ returnUrl }) {
    return returnUrl
  },
  async parseWebhook() {
    return []
  }
}
