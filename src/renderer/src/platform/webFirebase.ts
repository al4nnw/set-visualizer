import { initializeApp } from 'firebase/app'
import { GoogleAuthProvider, connectAuthEmulator, getAuth, onAuthStateChanged, signInWithCredential, signInWithPopup, signOut as authSignOut } from 'firebase/auth'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'

/**
 * The web version's Firebase project: Google sign-in, and the functions that
 * need it (YouTube search, and the account calls: functions/src). Loaded only when something needs
 * it, so the editor itself never waits for it. This config is public by design; what it can reach
 * is guarded by sign-in. `VITE_FIREBASE_EMULATORS=1 npm run dev` talks to `npm run emulators` instead.
 */
const app = initializeApp({
  apiKey: 'AIzaSyA87v03z4J0dqEcqwsoWW9RMPH8MTe83Cc',
  authDomain: 'set-visualizer-app.firebaseapp.com',
  projectId: 'set-visualizer-app',
  storageBucket: 'set-visualizer-app.firebasestorage.app',
  messagingSenderId: '481262081086',
  appId: '1:481262081086:web:8ed85844ae569f1beb6d6f'
})

const auth = getAuth(app)
const functions = getFunctions(app, 'southamerica-east1')
if (import.meta.env.VITE_FIREBASE_EMULATORS === '1') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)
  // For browser tests, where Google's sign-in scripts can't load: the auth emulator takes an unsigned token.
  Object.assign(window, {
    emulatorSignIn: (email: string) =>
      signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true, name: email.split('@')[0] })))
  })
}

/** Signs in with Google (a popup, so call it from a click). Creates the account the first time. */
export async function signIn(): Promise<void> {
  await signInWithPopup(auth, new GoogleAuthProvider())
}

export const signOut = () => authSignOut(auth)

export interface User {
  uid: string
  name: string
  email: string
  photo?: string
}

/** Calls back with who is signed in now, and again whenever that changes. */
export function onUser(cb: (u: User | null) => void): () => void {
  return onAuthStateChanged(auth, (u) =>
    cb(u && { uid: u.uid, name: u.displayName ?? u.email ?? '', email: u.email ?? u.providerData[0]?.email ?? '', photo: u.photoURL ?? undefined })
  )
}

/**
 * Asked when something needs a signed-in user and nobody is (the account store shows the sign-in
 * dialog); resolves false if they close it.
 */
let prompt: (() => Promise<boolean>) | null = null
export const setSignInPrompt = (p: () => Promise<boolean>) => void (prompt = p)

/** Signs in if not signed in yet (through the app's sign-in dialog when it has one). Throws if they don't. */
export async function signedIn(): Promise<void> {
  await auth.authStateReady()
  if (auth.currentUser) return
  if (!prompt) return void (await signIn())
  if (!(await prompt())) throw Object.assign(new Error('Not signed in'), { code: 'auth/popup-closed-by-user' })
}

export interface Video {
  id: string
  title: string
  channel: string
  duration?: string
}

export async function youtubeSearch(data: { q: string } | { ids: string[] }): Promise<Video[]> {
  await signedIn()
  const r = await httpsCallable<typeof data, { videos: Video[] }>(functions, 'youtubeSearch')(data)
  return r.data.videos
}

/** Whether someone is signed in already, without asking them to. */
export async function isSignedIn(): Promise<boolean> {
  await auth.authStateReady()
  return !!auth.currentUser
}

/** One of the account functions (functions/src/billing/functions.ts and admin.ts), as the signed-in user. */
export async function callAccount<Req, Res>(name: 'accountStatus' | 'claimExport' | 'settleExport' | 'startCheckout' | 'billingPortal' | 'adminListUsers' | 'adminAddExports' | 'adminSetPlan', data?: Req): Promise<Res> {
  return (await httpsCallable<Req | undefined, Res>(functions, name)(data)).data
}
