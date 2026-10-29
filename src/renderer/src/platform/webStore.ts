import type { PackedSpectrum } from '@shared/analysis'
import type { ProjectFile, Waveform } from '@shared/types'

/**
 * What the web version keeps in this browser (IndexedDB), and nowhere else: projects, the files they
 * use (an image's bytes; for a recording, only the browser's handle to it on disk, where the
 * browser has one) and each recording's analysis, so reopening a project doesn't analyse it again.
 */

export interface StoredProject {
  id: string
  /** The name its file gets when saved to disk ("My Set.djvis"). */
  fileName: string
  /** What the recent list shows (the set's title). */
  name: string
  audioName: string
  tracks: number
  savedAt: string
  project: ProjectFile
}

export interface StoredFile {
  id: string
  name: string
  /** The file itself, for small ones (images). */
  blob?: Blob
  /** The browser's handle to the file on disk (Chrome, Edge), for recordings. */
  handle?: FileSystemFileHandle
}

export interface StoredAnalysis {
  id: string
  duration: number
  waveform: Waveform
  spectrum: PackedSpectrum
}

type Stores = { projects: StoredProject; files: StoredFile; analyses: StoredAnalysis }
type Store = keyof Stores

let db: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  db ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('set-visualizer', 1)
    req.onupgradeneeded = () => {
      for (const name of ['projects', 'files', 'analyses']) req.result.createObjectStore(name, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error('The browser storage is in use by an older version of this page. Close its other tabs.'))
  })
  db.catch(() => (db = null))
  return db
}

function run<T>(store: Store, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const tx = d.transaction(store, mode)
        const req = fn(tx.objectStore(store))
        // Resolves once it's written, not just queued.
        tx.oncomplete = () => resolve(req.result)
        tx.onerror = tx.onabort = () => reject(tx.error ?? req.error)
      })
  )
}

export const get = <S extends Store>(store: S, id: string) => run<Stores[S] | undefined>(store, 'readonly', (s) => s.get(id))
export const getAll = <S extends Store>(store: S) => run<Stores[S][]>(store, 'readonly', (s) => s.getAll())
export const put = <S extends Store>(store: S, value: Stores[S]) => run(store, 'readwrite', (s) => s.put(value)).then(() => {})
export const remove = (store: Store, id: string) => run(store, 'readwrite', (s) => s.delete(id)).then(() => {})
export const clear = (store: Store) => run(store, 'readwrite', (s) => s.clear()).then(() => {})

/** Asks the browser once not to clear what's stored here when space runs low. */
let persisted = false
export function keep() {
  if (persisted) return
  persisted = true
  navigator.storage?.persist?.().catch(() => {})
}
