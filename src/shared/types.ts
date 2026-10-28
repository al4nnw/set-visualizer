export type Deck = 'A' | 'B'

export interface Track {
  id: string
  title: string
  artist: string
  /** Seconds into the set where this track becomes the main track (moves to the left). */
  start: number
  /**
   * Seconds into the set where this track starts being heard: it appears on the right as "now
   * playing". When undefined, it appears the project's default lead time early as "up next".
   */
  mixIn?: number
  /**
   * Seconds into the set where it stops being heard, when it keeps playing under the next track after
   * the swap. Until then its card stays on the right as "now playing".
   */
  tailEnd?: number
  deck: Deck
  /**
   * Only mixed in under another track and never takes over. It stays in the tracklist but never
   * becomes the main track; `start` is when its deck started.
   */
  layered?: boolean
  /** Absolute path to a local image file (downloaded or picked by the user). */
  artwork?: string
  /** Where the track/art was found (YouTube, SoundCloud, ...). */
  sourceUrl?: string
  source?: string
}

export interface Waveform {
  /** Peaks per second of audio. */
  rate: number
  /** Absolute peak per bucket, 0..1. */
  peaks: number[]
  /** RMS energy per bucket, 0..1 (drives the pulse effects). */
  rms: number[]
  /** RMS of the low-passed signal per bucket, 0..1 (kick/bass pulse). */
  bass: number[]
  /** RMS of the vocal band (250 Hz to 3.5 kHz) per bucket, 0..1. Missing in older projects. */
  vocal?: number[]
}

export interface Theme {
  background: string
  accent: string
  accentB: string
  text: string
  waveUnplayed: string
}

export interface RenderSettings {
  width: number
  height: number
  fps: number
  /** Seconds before `start` that the next track appears on the right, when the track has no mixIn. */
  defaultLead: number
  /** Seconds the A/B swap animation takes; it ends on the takeover point. */
  swapDuration: number
  /** Easing of the A/B swap; 'auto' picks curve and length per transition. Missing means auto. */
  swapCurve?: SwapCurve
  showTimestamps: boolean
  /** The scrolling close-up waveform above the full-set one. */
  showDeckWave: boolean
  /** The full-set waveform along the bottom, with track numbers. */
  showSetWave: boolean
  /** Shown top-left, e.g. "Live @ Home — October 2026". */
  setTitle: string
  djName: string
  theme: Theme
  quality: Quality
}

export type SwapCurve = 'auto' | 'smooth' | 'snappy' | 'anticipate' | 'spring'

export type Quality = 'standard' | 'high' | 'max'

/** Bits per pixel per frame for the WebCodecs encoder (YouTube re-encodes anyway). */
export const QUALITY_BPP: Record<Quality, number> = { standard: 0.07, high: 0.13, max: 0.25 }
/** x264 CRF used by the headless exporter. */
export const QUALITY_CRF: Record<Quality, number> = { standard: 21, high: 18, max: 15 }

/** The Rekordbox recording cue sheet a project's tracklist came from, kept in the project file. */
export interface CueImport {
  path: string
  name: string
  importedAt: string
  /** The cue sheet as imported, so the project still has it if the original file moves. */
  text: string
}

/** A .djvis project file (JSON). */
export interface Project {
  version: 1
  audioPath: string
  audioName: string
  duration: number
  waveform: Waveform
  tracks: Track[]
  settings: RenderSettings
  cue?: CueImport
  createdAt?: string
  savedAt?: string
}

/** App-wide preferences, stored in the user data folder (not in projects). */
export interface Preferences {
  /** Save the project on every change. */
  autosave: boolean
  /** Where new projects are created when a set recording is opened. */
  projectsDir: string
  /** Look up YouTube thumbnails for imported tracks. */
  autoArtwork: boolean
  /** Video settings that new projects start with. */
  defaultWidth: number
  defaultHeight: number
  defaultFps: number
}

export interface RecentProject {
  path: string
  name: string
  audioName?: string
  savedAt?: string
  tracks?: number
}

export interface SearchResult {
  provider: 'youtube' | 'soundcloud' | 'itunes' | 'deezer'
  id: string
  title: string
  artist: string
  url: string
  /** Best available image URL. */
  image: string
  thumbnail: string
  durationSec?: number
}

/** A stretch of the set to export on its own, in seconds. */
export interface ExportRange {
  from: number
  to: number
}

export interface ExportProgress {
  frame: number
  totalFrames: number
  fps: number
  etaSec: number
  stage: 'preparing' | 'rendering' | 'finishing' | 'done' | 'error' | 'cancelled'
  message?: string
  outputPath?: string
}

export const DEFAULT_THEME: Theme = {
  background: '#07070c',
  accent: '#ff3d7f',
  accentB: '#3dd6ff',
  text: '#ffffff',
  waveUnplayed: 'rgba(255,255,255,0.22)'
}

export const DEFAULT_SETTINGS: RenderSettings = {
  width: 1920,
  height: 1080,
  fps: 30,
  defaultLead: 45,
  swapDuration: 1.4,
  swapCurve: 'auto',
  showTimestamps: true,
  showDeckWave: true,
  showSetWave: true,
  setTitle: '',
  djName: '',
  theme: DEFAULT_THEME,
  quality: 'high'
}
