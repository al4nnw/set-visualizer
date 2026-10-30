import type { PackedSpectrum } from '@shared/analysis'
import { decodeText, parseTracklist } from '@shared/tracklist'
import type { Preferences, Project, ProjectFile, RecentProject } from '@shared/types'
import { AnalysisError, analyseFile, detectTakeoversOffThread } from '../analysis'
import { i18n } from '../i18n'
import type { FileRef, Platform } from './types'
import * as store from './webStore'
import { startExport, type VideoTarget } from './webExport'
import { downloadArtwork, searchDeezer, searchItunes, searchYoutube } from './webArt'

/**
 * The browser. Projects are saved in this browser's own storage (webStore.ts), autosaved like on
 * the desktop, and can be saved to disk as .djvis files and opened from them. Files the user picks
 * or drops get refs like "file:5242880-1730000000000/set.wav": the file's size and date, then its
 * name (the UI looks at the extension), so the same file always gets the same ref and its stored
 * analysis. A recording is never copied: where the browser can (Chrome, Edge) its handle on disk
 * is kept so a project can open it again on a later visit, and otherwise the user picks it again.
 * Audio is decoded and analysed on the computer's own cores (../analysis); nothing is uploaded.
 * Artwork is searched on Apple Music and Deezer by the browser itself, and on YouTube through the
 * site's Firebase function (webArt.ts); SoundCloud isn't in the web version and says so.
 */

/** The parts of the File System Access API used here (Chrome, Edge), which TypeScript lacks. */
interface PermissionHandle {
  queryPermission(o: { mode: 'read' }): Promise<PermissionState>
  requestPermission(o: { mode: 'read' }): Promise<PermissionState>
}
type PickerTypes = Array<{ description?: string; accept: Record<string, string[]> }>
interface FsWindow {
  showOpenFilePicker?(o: { multiple?: boolean; types?: PickerTypes; id?: string }): Promise<FileSystemFileHandle[]>
  showSaveFilePicker?(o: { suggestedName?: string; types?: PickerTypes; id?: string }): Promise<FileSystemFileHandle & { createWritable(): Promise<WritableStream & { write(d: unknown): Promise<void>; close(): Promise<void> }> }>
}
const fsw = window as unknown as FsWindow
type DropItem = DataTransferItem & { getAsFileSystemHandle?(): Promise<FileSystemHandle | null> }

const files = new Map<FileRef, File>()
const urls = new Map<FileRef, string>()

const idOf = (ref: FileRef) => ref.slice(ref.indexOf(':') + 1, ref.indexOf('/'))
const nameOf = (ref: FileRef) => ref.slice(ref.indexOf('/') + 1)
const isFileRef = (ref: string) => ref.startsWith('file:')
const isImage = (f: File) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif)$/i.test(f.name)

/** Files written to the store but maybe not yet finished, so a save can wait for them. */
const writing = new Map<string, Promise<void>>()

function register(f: File, handle?: FileSystemFileHandle): FileRef {
  const ref = `file:${f.size}-${f.lastModified}/${f.name}`
  files.set(ref, f)
  const id = idOf(ref)
  // Images are small: keep them. Recordings only by their handle; .cue and .djvis are read at once.
  const keep = isImage(f) ? { blob: f as Blob } : handle && !/\.(cue|djvis)$/i.test(f.name) ? { handle } : null
  if (keep) {
    const w = store.put('files', { id, name: f.name, ...keep }).catch(() => {})
    writing.set(id, w)
  }
  return ref
}

/** Thrown when a project's recording has to be picked again; App offers a button for it (NeedsFile). */
class NeedsFileError extends Error {
  constructor(
    readonly project: FileRef,
    readonly fileName: string
  ) {
    super(i18n.t('web.findRecording', { name: fileName }))
  }
}

/**
 * The file behind a ref: open in this tab, or kept in the store from an earlier visit. A handle the
 * browser no longer lets the page read asks for permission when `ask` (the call must come from a
 * click); null when it can't be had.
 */
async function resolve(ref: FileRef, ask: boolean): Promise<File | null> {
  const open = files.get(ref)
  if (open) return open
  if (!isFileRef(ref)) return null
  const rec = await store.get('files', idOf(ref)).catch(() => undefined)
  let f: File | null = null
  if (rec?.blob) f = new File([rec.blob], rec.name, { type: rec.blob.type })
  else if (rec?.handle) {
    const h = rec.handle as FileSystemFileHandle & PermissionHandle
    try {
      let state = await h.queryPermission({ mode: 'read' })
      if (state === 'prompt' && ask) state = await h.requestPermission({ mode: 'read' })
      if (state === 'granted') f = await h.getFile()
    } catch {
      // Moved or deleted, or the permission prompt needs a click: pick it again.
    }
  }
  if (f) files.set(ref, f)
  return f
}

function fileFor(ref: FileRef): File {
  const f = files.get(ref)
  if (!f) throw new Error(i18n.t('web.fileGone', { name: nameOf(ref) }))
  return f
}

const AUDIO_EXT = ['.wav', '.mp3', '.flac', '.aif', '.aiff', '.m4a', '.aac', '.ogg', '.opus']
const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp']
const TYPES = {
  audio: { description: 'Audio', accept: { 'audio/*': AUDIO_EXT } },
  cue: { description: 'Rekordbox cue sheet', accept: { 'application/x-cue': ['.cue'] } },
  project: { description: 'Set Visualizer project', accept: { 'application/json': ['.djvis'] } },
  image: { description: 'Image', accept: { 'image/*': IMAGE_EXT } }
}
type Kind = keyof typeof TYPES

/**
 * The browser's file picker, with handles to the files where it gives them (so a recording can be
 * opened again on a later visit). Resolves with nothing when it's closed without a choice.
 */
async function pick(kinds: Kind[], multiple = false): Promise<FileRef[]> {
  if (fsw.showOpenFilePicker) {
    try {
      // One filter for all the kinds (the first is the one shown), so they can be picked together.
      const all = { description: kinds.map((k) => TYPES[k].description).join(', '), accept: Object.assign({}, ...kinds.map((k) => TYPES[k].accept)) }
      const types = kinds.length > 1 ? [all, ...kinds.map((k) => TYPES[k])] : kinds.map((k) => TYPES[k])
      const handles = await fsw.showOpenFilePicker({ multiple, types, id: kinds[0] })
      return Promise.all(handles.map(async (h) => register(await h.getFile(), h)))
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return []
      // Not allowed here (an iframe, say): the plain picker below.
    }
  }
  // Without a click to answer, the browser wouldn't show it (and nothing would ever come back).
  if (navigator.userActivation && !navigator.userActivation.isActive) return []
  return new Promise((done) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = kinds.flatMap((k) => Object.entries(TYPES[k].accept).flatMap(([mime, ext]) => [...ext, ...(mime.endsWith('/*') ? [mime] : [])])).join(',')
    input.multiple = multiple
    input.onchange = () => done([...(input.files ?? [])].map((f) => register(f)))
    input.oncancel = () => done([])
    input.click()
  })
}

/** Downloads a file the page made (where the browser can't write to a file the user picks). */
function download(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000)
}

const PREFS_KEY = 'setvis.prefs'

const defaultPrefs = (): Preferences => ({
  autosave: true,
  projectsDir: '',
  // No automatic lookup in the browser (see autoArtwork below).
  autoArtwork: false,
  defaultWidth: 1920,
  defaultHeight: 1080,
  defaultFps: 30
})

function readPrefs(): Preferences {
  try {
    return { ...defaultPrefs(), ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') }
  } catch {
    return defaultPrefs()
  }
}

const notYet = (what: 'search') => Promise.reject(new Error(i18n.t(`web.${what}NotYet`)))

function os(): Platform['os'] {
  const p = ((navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? '').toLowerCase()
  return p.includes('mac') ? 'darwin' : p.includes('win') ? 'win32' : p.includes('linux') ? 'linux' : 'other'
}

/** What an analysis failure says to the user. */
function analysisMessage(e: unknown, name: string) {
  if (!(e instanceof AnalysisError)) return String((e as Error)?.message ?? e)
  if (e.reason === 'codec') return i18n.t('web.codec', { codec: e.codec ?? '?' })
  if (e.reason === 'format') return i18n.t('web.format', { name })
  if (e.reason === 'noAudio') return i18n.t('web.noAudio', { name })
  if (e.reason === 'cancelled') return e.message
  return i18n.t('web.analysisFailed', { name, error: e.message })
}

const projectRef = (r: store.StoredProject) => `project:${r.id}/${r.fileName}`
const PROJECT_EXT = /\.djvis$/i

/** What the recent list and the store call a project: its set's title, else the recording's name. */
const titleOf = (p: ProjectFile) => p.settings?.setTitle?.trim() || p.audioName.replace(/\.[^.]+$/, '')

/** A project file's name from its recording's: "My Set.djvis". */
const fileNameFor = (audioName: string) => `${audioName.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Untitled set'}.djvis`

/** Reads a .djvis the user opened from disk. */
async function readProjectFile(f: File): Promise<ProjectFile> {
  let p: ProjectFile | null = null
  try {
    p = JSON.parse(await f.text())
  } catch {
    // Not JSON: said below.
  }
  if (!p || typeof p.audioName !== 'string' || !Array.isArray(p.tracks)) throw new Error(i18n.t('web.notProject', { name: f.name }))
  return p
}

/** The project as a .djvis file for disk: its images go inside it, as the files they're in stay here. */
async function projectBlob(p: ProjectFile): Promise<Blob> {
  const dataUrl = (f: File) =>
    new Promise<string>((ok, fail) => {
      const r = new FileReader()
      r.onload = () => ok(r.result as string)
      r.onerror = () => fail(r.error)
      r.readAsDataURL(f)
    })
  const tracks = await Promise.all(
    p.tracks.map(async (t) => {
      const f = t.artwork && isFileRef(t.artwork) ? await resolve(t.artwork, false) : null
      return f ? { ...t, artwork: await dataUrl(f) } : t
    })
  )
  return new Blob([JSON.stringify({ ...p, tracks }, null, 2)], { type: 'application/json' })
}

export function webPlatform(): Platform {
  const progress = new Set<(p: number) => void>()
  // Spectral frames of each analysed recording, for takeover detection after a cue is imported.
  const spectra = new Map<FileRef, PackedSpectrum>()
  let running: AbortController | null = null
  let unsaved = false
  const videoTargets = new Map<FileRef, VideoTarget>()
  let exporting: Awaited<ReturnType<typeof startExport>> | null = null

  const analyse = async (ref: FileRef) => {
    const file = fileFor(ref)
    running?.abort()
    const ctl = (running = new AbortController())
    try {
      const r = await analyseFile(file, { signal: ctl.signal, onProgress: (p) => progress.forEach((cb) => cb(p)) })
      spectra.set(ref, r.spectrum)
      // Kept for reopening the project (and for this same recording in another one).
      if (isFileRef(ref)) store.put('analyses', { id: idOf(ref), duration: r.duration, waveform: r.waveform, spectrum: r.spectrum }).catch(() => {})
      return r
    } catch (e) {
      throw new Error(analysisMessage(e, file.name))
    } finally {
      if (running === ctl) running = null
    }
  }

  /** The recording's analysis: stored from before, or done now. */
  const analysisOf = async (ref: FileRef) => {
    const known = isFileRef(ref) ? await store.get('analyses', idOf(ref)).catch(() => undefined) : undefined
    if (known) {
      spectra.set(ref, known.spectrum)
      return known
    }
    return analyse(ref)
  }

  /** Writes a project to the store, once the files it uses are stored too. */
  const write = async (id: string, p: ProjectFile, fileName?: string): Promise<store.StoredProject> => {
    const ids = [p.audioPath, ...p.tracks.map((t) => t.artwork)].filter((r): r is string => !!r && isFileRef(r)).map(idOf)
    await Promise.all(ids.map((i) => writing.get(i)))
    const prev = fileName ? null : await store.get('projects', id)
    const savedAt = new Date().toISOString()
    const { waveform: _, ...project } = p as ProjectFile
    const rec: store.StoredProject = {
      id,
      fileName: fileName ?? prev?.fileName ?? fileNameFor(p.audioName),
      name: titleOf(p),
      audioName: p.audioName,
      tracks: p.tracks.length,
      savedAt,
      project: { ...project, savedAt }
    }
    await store.put('projects', rec)
    store.keep()
    return rec
  }

  const create = (p: ProjectFile) => write(crypto.randomUUID(), p, fileNameFor(p.audioName))

  return {
    kind: 'web',
    os: os(),
    features: { reveal: false, projectsFolder: false, windowControls: false, tutorial: false },

    mediaUrl(ref) {
      if (/^(https?|data|blob):/.test(ref)) return ref
      const f = files.get(ref)
      if (!f) return ''
      let url = urls.get(ref)
      if (!url) urls.set(ref, (url = URL.createObjectURL(f)))
      return url
    },
    refForFile: (f) => register(f),
    refsForDrop: async (dt) => {
      // Handles have to be asked for before the drop event ends; the files can be read after.
      const items = [...dt.items].filter((i) => i.kind === 'file') as DropItem[]
      const pending = items.map((i) => ({ file: i.getAsFile(), handle: i.getAsFileSystemHandle?.().catch(() => null) ?? Promise.resolve(null) }))
      const refs: FileRef[] = []
      for (const { file, handle } of pending) {
        if (!file) continue
        const h = await handle
        refs.push(register(file, h?.kind === 'file' ? (h as FileSystemFileHandle) : undefined))
      }
      return refs
    },

    openAudioDialog: async () => (await pick(['audio']))[0] ?? null,
    openAnyDialog: () => pick(['audio', 'cue', 'project'], true),
    openTracklistDialog: async () => (await pick(['cue']))[0] ?? null,
    pickImage: async () => (await pick(['image']))[0] ?? null,
    /** Where the video goes: a file the user picks (Chrome, Edge), or else a download. */
    chooseVideoPath: async (name) => {
      if (fsw.showSaveFilePicker) {
        try {
          const handle = await fsw.showSaveFilePicker({ suggestedName: name, types: [{ description: 'MP4', accept: { 'video/mp4': ['.mp4'] } }], id: 'video' })
          const ref = `video:${crypto.randomUUID()}/${handle.name}`
          videoTargets.set(ref, { kind: 'file', handle: handle as unknown as Extract<VideoTarget, { kind: 'file' }>['handle'], name: handle.name })
          return ref
        } catch (e) {
          if ((e as Error)?.name === 'AbortError') return null
        }
      }
      const ref = `video:${crypto.randomUUID()}/${name}`
      videoTargets.set(ref, { kind: 'download', name })
      return ref
    },
    chooseFolder: async () => null,

    analyseAudio: async (ref) => {
      const r = await analysisOf(ref)
      return { duration: r.duration, waveform: r.waveform, name: nameOf(ref) }
    },
    onAudioProgress: (cb) => {
      progress.add(cb)
      return () => void progress.delete(cb)
    },
    detectTakeovers: async (ref, cues, duration, songs) => {
      const spectrum = spectra.get(ref) ?? (await analysisOf(ref)).spectrum
      return detectTakeoversOffThread(spectrum, cues, duration, songs)
    },
    cancelAnalysis: async () => running?.abort(),
    readCue: async (ref) => {
      const f = fileFor(ref)
      const buf = new Uint8Array(await f.arrayBuffer())
      return { entries: parseTracklist(buf), text: decodeText(buf), name: f.name }
    },

    createProject: async (p) => {
      const rec = await create(p)
      return { path: projectRef(rec), savedAt: rec.savedAt }
    },
    saveProject: async (p, ref) => {
      const rec = ref.startsWith('project:') ? await write(idOf(ref), p) : await create(p)
      return { path: projectRef(rec), savedAt: rec.savedAt }
    },
    /** Saves a copy to disk as a .djvis file; the project stays saved in the browser too. */
    saveProjectAs: async (p, current) => {
      const name = current?.startsWith('project:') ? nameOf(current) : fileNameFor(p.audioName)
      // The picker first: it needs the click that asked for it, which a slow step would outlast.
      let target: Awaited<ReturnType<NonNullable<FsWindow['showSaveFilePicker']>>> | null = null
      if (fsw.showSaveFilePicker) {
        try {
          target = await fsw.showSaveFilePicker({ suggestedName: name, types: [TYPES.project], id: 'project' })
        } catch (e) {
          if ((e as Error)?.name === 'AbortError') return null
        }
      }
      const blob = await projectBlob(p)
      if (target) {
        const w = await target.createWritable()
        await w.write(blob)
        await w.close()
      } else download(blob, name)
      const rec = current?.startsWith('project:') ? await write(idOf(current), p) : await create(p)
      return { path: projectRef(rec), savedAt: rec.savedAt }
    },
    openProject: async (ref) => {
      ref ??= (await pick(['project']))[0]
      if (!ref) return null
      let rec: store.StoredProject | undefined
      if (ref.startsWith('project:')) {
        rec = await store.get('projects', idOf(ref))
        if (!rec) throw new Error(i18n.t('web.projectGone', { name: nameOf(ref) }))
      } else {
        // A .djvis from disk: it's kept in the browser from now on, under its own name.
        const f = fileFor(ref)
        if (!PROJECT_EXT.test(f.name)) throw new Error(i18n.t('web.notProject', { name: f.name }))
        rec = await write(crypto.randomUUID(), await readProjectFile(f), f.name)
      }
      const path = projectRef(rec)
      const p = rec.project
      // The recording: open in this tab, or from its handle (asking for permission: this follows
      // the click that opened the project). A desktop project's path means nothing here.
      const audio = await resolve(p.audioPath, true)
      if (!audio) throw new NeedsFileError(path, p.audioName)
      const { waveform } = await analysisOf(p.audioPath)
      // Images that are no longer there (a file from another computer) are left out.
      const tracks = await Promise.all(
        p.tracks.map(async (t) => (!t.artwork || !isFileRef(t.artwork) || (await resolve(t.artwork, false)) ? t : { ...t, artwork: undefined }))
      )
      const project: Project = { ...p, tracks, waveform }
      return { path, project }
    },
    locateFile: async (path) => {
      const rec = await store.get('projects', idOf(path))
      if (!rec) return false
      // A handle it had: the click on the button lets the browser ask for permission again.
      if (await resolve(rec.project.audioPath, true)) return true
      const ref = await openAudio()
      if (!ref) return false
      await write(rec.id, { ...rec.project, audioPath: ref, audioName: fileFor(ref).name })
      return true
    },
    recentProjects: async (): Promise<RecentProject[]> => {
      const all = await store.getAll('projects').catch(() => [])
      return all
        .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
        .map((r) => ({ path: projectRef(r), name: r.name, audioName: r.audioName, savedAt: r.savedAt, tracks: r.tracks }))
    },
    /** In the browser the recent list is where projects are kept: clearing it deletes them. */
    clearRecent: async () => {
      await Promise.all((['projects', 'files', 'analyses'] as const).map((s) => store.clear(s)))
    },

    tutorialFiles: async () => null,
    getPrefs: async () => readPrefs(),
    setPrefs: async (patch) => {
      const next = { ...readPrefs(), ...patch }
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next))
      } catch {
        // Storage blocked: the change lasts for this visit only.
      }
      return next
    },

    search: (provider, q) =>
      provider === 'youtube' ? searchYoutube(q) : provider === 'itunes' ? searchItunes(q) : provider === 'deezer' ? searchDeezer(q) : notYet('search'),
    downloadArt: async (url) => register(await downloadArtwork(url)),
    // Looking every track up by itself would spend the shared YouTube quota; search runs on request.
    autoArtwork: async () => null,

    exportBegin: async (p, out, range) => {
      await exporting?.abort()
      const target = videoTargets.get(out)
      if (!target) throw new Error(i18n.t('web.fileGone', { name: nameOf(out) }))
      exporting = await startExport(fileFor(p.audioPath), p, target, range)
    },
    exportChunk: (data, info) => info && exporting?.chunk(data, info),
    exportFinish: async () => {
      const job = exporting
      if (!job) throw new Error('No export in progress')
      try {
        return await job.finish()
      } finally {
        exporting = null
      }
    },
    exportAbort: async () => {
      const job = exporting
      exporting = null
      await job?.abort()
    },

    onOpenPath: () => () => {},
    onMenuCommand: () => () => {},
    setUnsaved: (u) => void (unsaved = u),
    // A page can't wait for a save as it closes: leaving with changes not yet saved asks first,
    // and autosave writes them meanwhile (and whenever the tab is hidden).
    onBeforeClose: (cb) => {
      const flush = () => unsaved && readPrefs().autosave && cb()
      const warn = (e: BeforeUnloadEvent) => {
        if (!unsaved) return
        flush()
        e.preventDefault()
      }
      const hidden = () => document.visibilityState === 'hidden' && flush()
      addEventListener('beforeunload', warn)
      document.addEventListener('visibilitychange', hidden)
      return () => {
        removeEventListener('beforeunload', warn)
        document.removeEventListener('visibilitychange', hidden)
      }
    },
    closeOk: () => {},
    quit: () => {},
    toggleDevTools: () => {},
    toggleFullScreen: () => void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {}),
    reveal: () => {},
    openExternal: (url) => void window.open(url, '_blank', 'noopener')
  }
}

const openAudio = async () => (await pick(['audio']))[0] ?? null
