/**
 * Checks an export ticket (functions/src/billing/ticket.ts): signed by the server, not expired,
 * for this kind of export and this user. The export doesn't render without one.
 */

/** Public halves (SPKI, P-256) of the EXPORT_TICKET_KEY secret (from npm run ticket-key), and of the emulators' key. */
const PROD_KEY = '' // set by npm run ticket-key
const DEV_KEY = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAErmZ78UltaZm1YmDA79I0zr2zcNoDXAa0hm459INnGSonn6kPAcGdjPATBrj/1seFmZh/dxByPscK+LbDfc7Vzw=='

export interface Ticket {
  id: string
  uid: string
  kind: 'set' | 'clip'
  exp: number
}

const bytes = (b64url: string) => Uint8Array.from(atob(b64url.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

let key: Promise<CryptoKey> | null = null
const publicKey = () =>
  (key ??= crypto.subtle.importKey('spki', bytes(import.meta.env.VITE_FIREBASE_EMULATORS === '1' ? DEV_KEY : PROD_KEY), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']))

/** The ticket's contents, or an error saying why it isn't good for this export. */
export async function checkTicket(ticket: string | undefined, want: { kind: 'set' | 'clip'; uid?: string }): Promise<Ticket> {
  const [body, sig] = (ticket ?? '').split('.')
  if (!body || !sig) throw new Error('No export ticket')
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, await publicKey(), bytes(sig), new TextEncoder().encode(body))
  if (!ok) throw new Error('Invalid export ticket')
  const t = JSON.parse(new TextDecoder().decode(bytes(body))) as Ticket & { v: number }
  if (t.v !== 1 || t.kind !== want.kind || (want.uid && t.uid !== want.uid)) throw new Error('Export ticket is for another export')
  if (Date.now() > t.exp) throw new Error('Export ticket expired')
  return t
}
