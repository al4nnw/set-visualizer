// Makes the export-ticket key pair (see functions/src/billing/ticket.ts): stores the private half
// as the EXPORT_TICKET_KEY secret in Firebase and writes the public half into the app
// (PROD_KEY in src/renderer/src/account/ticket.ts). The private key is never written to disk.
// Run once, signed in to the Firebase CLI: npm run ticket-key
import { execFileSync } from 'node:child_process'
import { generateKeyPairSync } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' })
execFileSync('npx', ['--yes', 'firebase-tools@15', 'functions:secrets:set', 'EXPORT_TICKET_KEY', '--data-file', '-', '--project', 'set-visualizer-app', '--force'], { input: pem, stdio: ['pipe', 'inherit', 'inherit'] })

const file = new URL('../src/renderer/src/account/ticket.ts', import.meta.url)
const spki = publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
writeFileSync(file, readFileSync(file, 'utf8').replace(/const PROD_KEY = '[^']*'/, `const PROD_KEY = '${spki}'`))
console.log('EXPORT_TICKET_KEY is set. Commit the new PROD_KEY in src/renderer/src/account/ticket.ts.')
