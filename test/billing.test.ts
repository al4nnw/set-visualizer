import { describe, expect, it } from 'vitest'
import { applyEvent, claimExport, emptyAccount, entitlementOf, refundExport } from '../functions/src/billing/entitlements'
import { FREE_EXPORTS, GRACE_MS } from '../functions/src/billing/plans'
import type { Account, BillingEvent } from '../functions/src/billing/types'

const DAY = 24 * 3600 * 1000
const NOW = Date.UTC(2026, 9, 30)
const ent = (a: Account, now = NOW) => entitlementOf(a, now, { checkout: true })

/** Claims `n` exports in a row, failing the test if one is refused. */
function claimN(a: Account, n: number) {
  for (let i = 0; i < n; i++) {
    const r = claimExport(a, NOW)
    expect(r, `export ${i + 1}`).not.toBeNull()
    a = r!.account
  }
  return a
}

const sub = (status: 'active' | 'past_due' | 'canceled', periodEnd: number, occurredAt = NOW, id = 'evt1'): BillingEvent => ({
  provider: 'test',
  id,
  uid: 'u1',
  customerId: 'cus_1',
  occurredAt,
  kind: 'subscription',
  subscriptionId: 'sub_1',
  status,
  currentPeriodEnd: periodEnd
})

describe('free exports', () => {
  it(`gives ${FREE_EXPORTS} free exports, then refuses`, () => {
    const a = claimN(emptyAccount(), FREE_EXPORTS)
    expect(ent(a)).toMatchObject({ plan: 'free', unlimited: false, freeLeft: 0, freeUsed: FREE_EXPORTS })
    expect(claimExport(a, NOW)).toBeNull()
  })

  it('gives a failed export back, never below zero', () => {
    const a = claimN(emptyAccount(), FREE_EXPORTS)
    expect(ent(refundExport(a)).freeLeft).toBe(1)
    expect(refundExport(emptyAccount()).freeExportsUsed).toBe(0)
  })
})

describe('monthly plan', () => {
  it('exports without counting while paid', () => {
    let a = applyEvent(claimN(emptyAccount(), FREE_EXPORTS), sub('active', NOW + 30 * DAY))
    expect(ent(a)).toMatchObject({ plan: 'monthly', unlimited: true, periodEnd: NOW + 30 * DAY, canManage: true })
    a = claimN(a, 10)
    expect(a.freeExportsUsed).toBe(FREE_EXPORTS)
    expect(a.exportsTotal).toBe(FREE_EXPORTS + 10)
  })

  it('keeps a late renewal working for the grace period only', () => {
    const a = applyEvent(emptyAccount(), sub('past_due', NOW))
    expect(ent(a, NOW + GRACE_MS - 1).unlimited).toBe(true)
    expect(ent(a, NOW + GRACE_MS + 1).unlimited).toBe(false)
  })

  it('a canceled plan works until its period ends, with no grace', () => {
    const a = applyEvent(emptyAccount(), { ...sub('canceled', NOW + DAY), cancelAtPeriodEnd: true })
    expect(ent(a)).toMatchObject({ plan: 'monthly', cancelAtPeriodEnd: true })
    expect(ent(a, NOW + DAY + 1).plan).toBe('free')
  })

  it('ignores an older event that arrives late', () => {
    const renewed = applyEvent(emptyAccount(), sub('active', NOW + 60 * DAY, NOW, 'new'))
    const stale = applyEvent(renewed, sub('canceled', NOW, NOW - DAY, 'old'))
    expect(stale.subscription).toEqual(renewed.subscription)
  })
})

describe('lifetime plan', () => {
  const bought: BillingEvent = { provider: 'test', id: 'e', uid: 'u1', occurredAt: NOW, kind: 'lifetime.purchased', orderId: 'o1' }

  it('is unlimited, and wins over an ended subscription', () => {
    const a = applyEvent(applyEvent(emptyAccount(), sub('canceled', NOW - DAY)), bought)
    expect(ent(a, NOW + 3650 * DAY)).toMatchObject({ plan: 'lifetime', unlimited: true })
  })

  it('ends when that order is refunded, not another', () => {
    const a = applyEvent(emptyAccount(), bought)
    expect(ent(applyEvent(a, { ...bought, id: 'r', kind: 'lifetime.refunded', orderId: 'other' })).plan).toBe('lifetime')
    expect(ent(applyEvent(a, { ...bought, id: 'r', kind: 'lifetime.refunded' })).plan).toBe('free')
  })
})

it('offers no billing page without a provider', () => {
  const a = applyEvent(emptyAccount(), sub('active', NOW + DAY))
  expect(entitlementOf(a, NOW, { checkout: false })).toMatchObject({ canManage: false, checkout: false })
})
