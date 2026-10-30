import { createPrivateKey, sign } from 'node:crypto'
import { defineSecret } from 'firebase-functions/params'

/**
 * Export tickets: proof, signed here, that the server allowed an export. The app checks the
 * signature with the public key it ships with (src/renderer/src/account/ticket.ts) before it
 * renders, and writes the ticket id into the video. It doesn't make the browser impossible to
 * tamper with, but skipping the payment check now means rewriting the app's code, not one flag.
 *
 * The private key (ECDSA P-256, PKCS#8 PEM) is the EXPORT_TICKET_KEY secret.
 */
export const EXPORT_TICKET_KEY = defineSecret('EXPORT_TICKET_KEY')

/** How long a ticket stays good: long enough to wait behind other exports in the queue. */
const TTL_MS = 24 * 3600 * 1000

export interface TicketPayload {
  v: 1
  /** The export's id (users/{uid}/exports/{id}). */
  id: string
  uid: string
  kind: 'set' | 'clip'
  iat: number
  exp: number
}

const b64url = (b: Buffer) => b.toString('base64url')

export function signTicket(p: Omit<TicketPayload, 'v' | 'iat' | 'exp'>, now = Date.now()): string {
  const payload: TicketPayload = { v: 1, ...p, iat: now, exp: now + TTL_MS }
  const body = b64url(Buffer.from(JSON.stringify(payload)))
  const key = createPrivateKey(EXPORT_TICKET_KEY.value())
  const sig = sign('sha256', Buffer.from(body), { key, dsaEncoding: 'ieee-p1363' })
  return `${body}.${b64url(sig)}`
}
