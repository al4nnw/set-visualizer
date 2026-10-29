import type { PackedSpectrum } from '@shared/analysis'
import { decodeText, parseTracklist } from '@shared/tracklist'
import type { Preferences } from '@shared/types'
import { AnalysisError, analyseFile, detectTakeoversOffThread } from '../analysis'
import { i18n } from '../i18n'
import type { FileRef, Platform } from './types'
import { downloadArtwork, searchYoutube } from './webArt'

/**
 * The browser: files the user picks or drops are kept for the session under refs like
 * "web:3/set.wav" (ending in the file's name, as the UI looks at the extension). Audio is decoded
 * and analysed on the computer's own cores (../analysis); nothing is uploaded. Artwork comes from
 * YouTube, fetched by the browser itself (./webArt). Saving projects, the other artwork sources and
 * video export aren't in the web version yet and say so.
 */

const files = new Map<FileRef, File>()
const urls = new Map<FileRef, string>()
let nextId = 1

function register(f: File): FileRef {
  for (const [ref, known] of files) if (known === f) return ref
  const ref = `web:${nextId++}/${f.name}`
  files.set(ref, f)
  return ref
}

function fileFor(ref: FileRef): File {
  const f = files.get(ref)
  if (!f) throw new Error(i18n.t('web.fileGone', { name: ref.split('/').pop() }))
  return f
}

const AUDIO_ACCEPT = '.wav,.mp3,.flac,.aif,.aiff,.m4a,.aac,.ogg,.opus,audio/*'

/** The browser's file picker. Resolves with nothing when it's closed without a choice. */
function pick(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.multiple = multiple
    input.onchange = () => resolve([...(input.files ?? [])])
    input.oncancel = () => resolve([])
    input.click()
  })
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

const notYet = (what: 'projects' | 'export' | 'search') => Promise.reject(new Error(i18n.t(`web.${what}NotYet`)))

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

export function webPlatform(): Platform {
  const progress = new Set<(p: number) => void>()
  // Spectral frames of each analysed recording, for takeover detection after a cue is imported.
  const spectra = new Map<FileRef, PackedSpectrum>()
  let running: AbortController | null = null
  let opened = false

  const analyse = async (ref: FileRef) => {
    const file = fileFor(ref)
    running?.abort()
    const ctl = (running = new AbortController())
    try {
      const r = await analyseFile(file, { signal: ctl.signal, onProgress: (p) => progress.forEach((cb) => cb(p)) })
      spectra.set(ref, r.spectrum)
      return r
    } catch (e) {
      throw new Error(analysisMessage(e, file.name))
    } finally {
      if (running === ctl) running = null
    }
  }

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
    refForFile: register,

    openAudioDialog: async () => {
      const [f] = await pick(AUDIO_ACCEPT)
      return f ? register(f) : null
    },
    openAnyDialog: async () => (await pick(`${AUDIO_ACCEPT},.cue,.djvis`, true)).map(register),
    openTracklistDialog: async () => {
      const [f] = await pick('.cue')
      return f ? register(f) : null
    },
    pickImage: async () => {
      const [f] = await pick('image/jpeg,image/png,image/webp')
      return f ? register(f) : null
    },
    chooseVideoPath: () => notYet('export'),
    chooseFolder: async () => null,

    analyseAudio: async (ref) => {
      const r = await analyse(ref)
      opened = true
      return { duration: r.duration, waveform: r.waveform, name: fileFor(ref).name }
    },
    onAudioProgress: (cb) => {
      progress.add(cb)
      return () => void progress.delete(cb)
    },
    detectTakeovers: async (ref, cues, duration, songs) => {
      const spectrum = spectra.get(ref) ?? (await analyse(ref)).spectrum
      return detectTakeoversOffThread(spectrum, cues, duration, songs)
    },
    cancelAnalysis: async () => running?.abort(),
    readCue: async (ref) => {
      const f = fileFor(ref)
      const buf = new Uint8Array(await f.arrayBuffer())
      return { entries: parseTracklist(buf), text: decodeText(buf), name: f.name }
    },

    createProject: () => notYet('projects'),
    saveProject: () => notYet('projects'),
    saveProjectAs: () => notYet('projects'),
    openProject: () => notYet('projects'),
    recentProjects: async () => [],
    clearRecent: async () => {},

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

    search: (provider, q) => (provider === 'youtube' ? searchYoutube(q) : notYet('search')),
    downloadArt: async (url) => register(await downloadArtwork(url)),
    // Looking every track up by itself would spend the shared YouTube quota; search runs on request.
    autoArtwork: async () => null,

    exportBegin: () => notYet('export'),
    exportChunk: () => {},
    exportFinish: () => notYet('export'),
    exportAbort: async () => {},

    onOpenPath: () => () => {},
    onMenuCommand: () => () => {},
    // Nothing is saved in the browser yet, so leaving the page with a set open asks first.
    onBeforeClose: () => {
      const warn = (e: BeforeUnloadEvent) => {
        if (opened) e.preventDefault()
      }
      addEventListener('beforeunload', warn)
      return () => removeEventListener('beforeunload', warn)
    },
    closeOk: () => {},
    quit: () => {},
    toggleDevTools: () => {},
    toggleFullScreen: () => void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {}),
    reveal: () => {},
    openExternal: (url) => void window.open(url, '_blank', 'noopener')
  }
}
