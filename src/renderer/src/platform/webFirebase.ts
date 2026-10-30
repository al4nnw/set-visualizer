import { initializeApp } from 'firebase/app'
import { GoogleAuthProvider, getAuth, signInWithPopup } from 'firebase/auth'
import { getFunctions, httpsCallable } from 'firebase/functions'

/**
 * The web version's Firebase project: Google sign-in, and the functions that need it (YouTube
 * search, functions/src/index.ts). Loaded only when something needs it, so the editor itself
 * never waits for it. This config is public by design; what it can reach is guarded by sign-in.
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

/** Signs in with Google if not signed in yet (a popup, so call it from a click). */
export async function signedIn(): Promise<void> {
  await auth.authStateReady()
  if (!auth.currentUser) await signInWithPopup(auth, new GoogleAuthProvider())
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
