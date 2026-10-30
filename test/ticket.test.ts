import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it, vi } from 'vitest'

// The emulators' key pair: the server half from functions/.secret.local, the app checks with DEV_KEY.
const pem = /EXPORT_TICKET_KEY="(.*)"/.exec(readFileSync(new URL('../functions/.secret.local', import.meta.url), 'utf8'))![1].replace(/\\n/g, '\n')

let signTicket: typeof import('../functions/src/billing/ticket').signTicket
let checkTicket: typeof import('../src/renderer/src/account/ticket').checkTicket
beforeAll(async () => {
  process.env.EXPORT_TICKET_KEY = pem
  vi.stubEnv('VITE_FIREBASE_EMULATORS', '1')
  ;({ signTicket } = await import('../functions/src/billing/ticket'))
  ;({ checkTicket } = await import('../src/renderer/src/account/ticket'))
})

describe('export tickets', () => {
  it('accepts a ticket the server signed, for that export and user', async () => {
    const t = await checkTicket(signTicket({ id: 'e1', uid: 'u1', kind: 'clip' }), { kind: 'clip', uid: 'u1' })
    expect(t.id).toBe('e1')
  })

  it('refuses a missing, edited, expired or mismatched ticket', async () => {
    const good = signTicket({ id: 'e1', uid: 'u1', kind: 'clip' })
    await expect(checkTicket(undefined, { kind: 'clip' })).rejects.toThrow('No export ticket')
    const [body, sig] = good.split('.')
    const edited = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), kind: 'set' })).toString('base64url')
    await expect(checkTicket(`${edited}.${sig}`, { kind: 'set' })).rejects.toThrow('Invalid')
    await expect(checkTicket(good, { kind: 'set' })).rejects.toThrow('another export')
    await expect(checkTicket(good, { kind: 'clip', uid: 'u2' })).rejects.toThrow('another export')
    await expect(checkTicket(signTicket({ id: 'e1', uid: 'u1', kind: 'clip' }, Date.now() - 25 * 3600e3), { kind: 'clip' })).rejects.toThrow('expired')
  })
})
