import { HttpsError } from 'firebase-functions/v2/https'
import type { PaymentProvider } from '../provider.js'

/** No payment provider yet: the free exports work, and the plans show as coming soon. */
export const noProvider: PaymentProvider = {
  id: 'none',
  checkout: false,
  async createCheckout() {
    throw new HttpsError('failed-precondition', 'billing-unavailable')
  },
  async portalUrl() {
    return null
  },
  async parseWebhook() {
    throw new HttpsError('not-found', 'No payment provider')
  }
}
