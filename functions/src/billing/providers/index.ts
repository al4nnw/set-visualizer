import type { PaymentProvider } from '../provider.js'
import { fakeProvider } from './fake.js'
import { noProvider } from './none.js'

/**
 * The provider in use, from BILLING_PROVIDER (functions/.env, or .env.local for the emulators).
 * A new provider goes in this list; nothing else changes.
 */
const PROVIDERS: Record<string, () => PaymentProvider> = {
  none: () => noProvider,
  fake: () => {
    if (process.env.FUNCTIONS_EMULATOR !== 'true') throw new Error('The fake payment provider only runs in the emulators')
    return fakeProvider
  }
}

let current: PaymentProvider | undefined

export function paymentProvider(): PaymentProvider {
  if (current) return current
  const name = process.env.BILLING_PROVIDER || 'none'
  const make = PROVIDERS[name]
  if (!make) throw new Error(`Unknown BILLING_PROVIDER "${name}"`)
  return (current = make())
}
