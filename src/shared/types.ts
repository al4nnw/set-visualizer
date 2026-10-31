import type { Locale } from './i18n'

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
}

export interface RenderSettings {
  width: number
  height: number
  fps: number
  /** Seconds the A/B swap animation takes; it ends on the takeover point. */
  swapDuration: number
  /** Easing of the A/B swap; 'auto' picks curve and length per transition. Missing means auto. */
  swapCurve?: SwapCurve
  showTimestamps: boolean
  /** The scrolling close-up waveform. */
  showDeckWave: boolean
  /** Which lane of the bottom area the waveform sits in. Missing means bottom. Ignored in social. */
  wavePosition?: WavePosition
  /**
   * 9:16 laid out for TikTok and Reels: everything stays clear of the apps' buttons and captions,
   * and the waveform sits at the top. Only applies when the video is portrait.
   */
  social?: boolean
  /** Preview-only stand-in for the TikTok or Reels buttons over a social video; never exported. */
  appOverlay?: AppOverlay
  /** The line along the bottom that fills up as the video plays. Missing means hidden. */
  progressBar?: ProgressBar
  /** Shown top-left, e.g. "Live @ Home — October 2026". */
  setTitle: string
  djName: string
  /** Language of the text drawn into the video ("NOW PLAYING", ...). Missing means English. */
  videoLanguage?: Locale
  theme: Theme
  quality: Quality
}

/** 16:9 for YouTube, 9:16 for phones, or 9:16 laid out for TikTok and Reels. */
export type VideoFormat = 'landscape' | 'portrait' | 'social'

export type AppOverlay = 'off' | 'tiktok' | 'reels'

/** How the completion line looks. */
export interface ProgressBar {
  show: boolean
  style: ProgressStyle
  /** Thickness in pixels of a 1080 px short side. */
  size: number
  /** How much it swells on each kick, 0..1. */
  pulse: number
  /** A colour, or 'deck' to follow the colour of the deck that's playing. */
  color: string
}

export type ProgressStyle = 'flat' | 'rounded' | 'glow'

export const PROGRESS_SIZE = { min: 2, max: 24 }

export const DEFAULT_PROGRESS: ProgressBar = { show: true, style: 'rounded', size: 8, pulse: 0.5, color: 'deck' }

export type WavePosition = 'top' | 'middle' | 'bottom'

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
  /** Suggested clips the user lengthened or shortened, by clip id. */
  clipEdits?: Record<string, { from: number; to: number }>
  createdAt?: string
  savedAt?: string
}

/**
 * A project as stored in its .djvis file and sent to the main process to save. The waveform is kept
 * in the analysis cache instead (projects from before that still carry it, and are read as is).
 */
export type ProjectFile = Omit<Project, 'waveform'> & { waveform?: Waveform }

/** The project without its waveform, for saving: cloning the waveform costs more than the rest. */
export const forDisk = ({ waveform: _, ...rest }: Project | ProjectFile): ProjectFile => rest

/** App-wide preferences, stored in the browser (not in projects). */
export interface Preferences {
  /** Save the project on every change. */
  autosave: boolean
  /** Look up YouTube thumbnails for imported tracks. */
  autoArtwork: boolean
  /** Video settings that new projects start with. */
  defaultWidth: number
  defaultHeight: number
  defaultFps: number
  /** The one-time note about the Clips tab was shown. */
  clipsHintSeen?: boolean
  /** The one-time note that the preview volume does not change exports was shown. */
  volumeHintSeen?: boolean
  /** UI language; missing or 'system' follows the OS. */
  language?: Locale | 'system'
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
  text: '#ffffff'
}

/** The name drawn top-left in every video (the app's watermark); not editable. */
export const BRAND = 'REKCUT'

export const DEFAULT_SETTINGS: RenderSettings = {
  width: 1920,
  height: 1080,
  fps: 30,
  swapDuration: 1.4,
  swapCurve: 'auto',
  showTimestamps: true,
  showDeckWave: true,
  progressBar: DEFAULT_PROGRESS,
  setTitle: '',
  djName: BRAND,
  theme: DEFAULT_THEME,
  quality: 'high'
}
