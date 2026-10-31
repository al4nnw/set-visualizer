import { HttpsError, onCall, onRequest, type CallableRequest } from 'firebase-functions/v2/https'
import { entitlementOf } from './entitlements.js'
import { isPlanId } from './plans.js'
import { paymentProvider } from './providers/index.js'
import { claim, getAccount, recordEvent, settle, type ExportKind } from './store.js'
import { EXPORT_TICKET_KEY, signTicket } from './ticket.js'
import type { Account, Entitlement } from './types.js'

/**
 * The app's account calls: what a user may export, spending an export, and buying a plan. All
 * need sign-in. The render itself stays in the browser; these only count.
 */

const opts = { region: 'southamerica-east1', maxInstances: 10 }

const uidOf = (req: CallableRequest) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first')
  return req.auth.uid
}

const view = (acc: Account): Entitlement => entitlementOf(acc, Date.now(), { checkout: paymentProvider().checkout })

/** Checkout pages may only send people back to the app itself. */
const APP_ORIGINS = [/^https:\/\/set-visualizer-app\.(web\.app|firebaseapp\.com)$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/]
function appUrl(v: unknown): string {
  try {
    const u = new URL(String(v))
    if (APP_ORIGINS.some((o) => o.test(u.origin))) return u.toString()
  } catch {
    // falls through
  }
  throw new HttpsError('invalid-argument', 'returnUrl must be a page of the app')
}

export const accountStatus = onCall(opts, async (req) => view(await getAccount(uidOf(req))))

/**
 * `{ kind }` → `{ ok: true, id, ticket }` (the signed ticket the app needs to render, see
 * ticket.ts), or `{ ok: false }` when a free account has no exports left.
 */
export const claimExport = onCall({ ...opts, secrets: [EXPORT_TICKET_KEY] }, async (req) => {
  const uid = uidOf(req)
  const kind = (req.data as { kind?: unknown })?.kind
  if (kind !== 'set' && kind !== 'clip') throw new HttpsError('invalid-argument', 'kind is set or clip')
  const r = await claim(uid, kind as ExportKind)
  if (!r) return { ok: false, entitlement: view(await getAccount(uid)) }
  const ent = view(r.account)
  return { ok: true, id: r.id, ticket: signTicket({ id: r.id, uid, kind: kind as ExportKind, paid: ent.unlimited }), entitlement: ent }
})

/** `{ id, ok }`: the export finished, or failed / was cancelled (giving a free one back). */
export const settleExport = onCall(opts, async (req) => {
  const uid = uidOf(req)
  const { id, ok } = (req.data ?? {}) as { id?: unknown; ok?: unknown }
  if (typeof id !== 'string' || !/^\w{1,64}$/.test(id) || typeof ok !== 'boolean') throw new HttpsError('invalid-argument', 'id and ok')
  return view(await settle(uid, id, ok))
})

/** `{ plan, returnUrl }` → `{ url }`, the provider's checkout page. */
export const startCheckout = onCall(opts, async (req) => {
  const uid = uidOf(req)
  const { plan, returnUrl } = (req.data ?? {}) as { plan?: unknown; returnUrl?: unknown }
  if (!isPlanId(plan)) throw new HttpsError('invalid-argument', 'Unknown plan')
  const back = appUrl(returnUrl)
  const provider = paymentProvider()
  const acc = await getAccount(uid)
  const now = view(acc)
  if (now.plan === 'lifetime' || (now.plan === 'monthly' && plan === 'monthly')) throw new HttpsError('already-exists', 'already-paid')
  const sep = back.includes('?') ? '&' : '?'
  const session = await provider.createCheckout({
    uid,
    email: req.auth?.token.email,
    plan,
    customerId: acc.customers?.[provider.id],
    successUrl: `${back}${sep}checkout=done`,
    cancelUrl: `${back}${sep}checkout=cancelled`
  })
  for (const e of session.completed ?? []) await recordEvent(e)
  return { url: session.url }
})

/** `{ returnUrl }` → `{ url }`, the provider's page for managing or cancelling the plan. */
export const billingPortal = onCall(opts, async (req) => {
  const uid = uidOf(req)
  const back = appUrl((req.data as { returnUrl?: unknown })?.returnUrl)
  const provider = paymentProvider()
  const customerId = (await getAccount(uid)).customers?.[provider.id]
  const url = customerId ? await provider.portalUrl({ customerId, returnUrl: back }) : null
  if (!url) throw new HttpsError('failed-precondition', 'billing-unavailable')
  return { url }
})

/** Where the provider reports payments, renewals, cancellations and refunds. */
export const billingWebhook = onRequest({ ...opts, invoker: 'public' }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).end()
    return
  }
  let events
  try {
    events = await paymentProvider().parseWebhook({ rawBody: req.rawBody, headers: req.headers })
  } catch (e) {
    console.warn('Rejected billing webhook', e)
    res.status(400).end()
    return
  }
  for (const e of events) await recordEvent(e)
  res.status(200).json({ received: events.length })
})
