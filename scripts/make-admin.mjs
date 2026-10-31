// Lets a signed-up user open the back office (see functions/src/billing/admin.ts) by adding
// admins/{uid} in Firestore. The user must have signed in to the app once.
//   npm run make-admin -- you@example.com             production: needs `gcloud auth application-default login`
//   npm run make-admin -- you@example.com --emulators against `npm run emulators`
//   add --remove to take it away again
// The same can be done by hand: Firebase console > Firestore > collection "admins", document id =
// the user's UID (Authentication > Users), any field.
import { createRequire } from 'node:module'

const args = process.argv.slice(2)
const email = args.find((a) => !a.startsWith('--'))
if (!email) {
  console.error('Usage: npm run make-admin -- <email> [--emulators] [--remove]')
  process.exit(1)
}
if (args.includes('--emulators')) {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080'
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099'
}
// firebase-admin is a dependency of the functions (npm ci --prefix functions).
const require = createRequire(new URL('../functions/package.json', import.meta.url))
const { initializeApp } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getFirestore } = require('firebase-admin/firestore')

initializeApp({ projectId: 'set-visualizer-app' })
const user = await getAuth().getUserByEmail(email)
const ref = getFirestore().collection('admins').doc(user.uid)
if (args.includes('--remove')) {
  await ref.delete()
  console.log(`${email} can no longer open the back office.`)
} else {
  await ref.set({ email, at: Date.now() })
  console.log(`${email} (${user.uid}) can open the back office: Account > Back office.`)
}
