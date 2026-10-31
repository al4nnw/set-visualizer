import type { ExportRange, Preferences, Project, ProjectFile, RecentProject, SearchResult, Waveform } from '@shared/types'
import type { ParsedEntry } from '@shared/tracklist'

/**
 * Names a file the platform can read: the browser's own id for a file or handle the user picked.
 * The UI never looks inside one; it only passes it back to the platform (and shows `fileName` of one).
 */
export type FileRef = string

export type Saved = { path: FileRef; savedAt: string }

/** A project that can't open until the user picks its recording (`fileName`) again: see locateFile. */
export type NeedsFile = Error & { project: FileRef; fileName: string }
export const needsFile = (e: unknown): e is NeedsFile => e instanceof Error && typeof (e as NeedsFile).project === 'string' && typeof (e as NeedsFile).fileName === 'string'

export type Takeover = { start: number; audibleAt: number; tailEnd: number } | null

/**
 * Everything the editor needs from the shell it runs in: files, dialogs, audio analysis, saving
 * projects, artwork search and writing the exported video, implemented with browser APIs (web.ts).
 */
export interface Platform {
  /** The OS, for shortcut labels ('darwin' shows ⌘). */
  os: 'darwin' | 'win32' | 'linux' | 'other'

  /** URL the UI can load a file from (audio element, <img>, fetch). */
  mediaUrl(ref: FileRef): string
  /** A dropped file, as something the other calls accept. */
  refForFile(f: File): FileRef
  /** Dropped files, where the platform keeps more of them than refForFile can (the web's handles). */
  refsForDrop?(dt: DataTransfer): Promise<FileRef[]>

  openAudioDialog(): Promise<FileRef | null>
  /** One picker for a recording (optionally with its .cue) or a .djvis project. */
  openAnyDialog(): Promise<FileRef[]>
  openTracklistDialog(): Promise<FileRef | null>
  pickImage(): Promise<FileRef | null>
  /** Where the exported video goes. */
  chooseVideoPath(defaultName: string): Promise<FileRef | null>

  analyseAudio(ref: FileRef): Promise<{ duration: number; waveform: Waveform; name: string }>
  onAudioProgress(cb: (p: number) => void): () => void
  detectTakeovers(ref: FileRef, cues: number[], duration: number, songs?: Array<{ title: string; artist: string }>): Promise<Takeover[]>
  /** Stops any analysis in progress (its promise rejects with "Analysis cancelled"). */
  cancelAnalysis(): Promise<void>
  readCue(ref: FileRef): Promise<{ entries: ParsedEntry[]; text: string; name: string }>

  /** Saves a new project and returns where. */
  createProject(p: ProjectFile): Promise<Saved>
  saveProject(p: ProjectFile, ref: FileRef): Promise<Saved>
  saveProjectAs(p: ProjectFile, current: FileRef | null): Promise<Saved | null>
  /** Rejects with a NeedsFile error when the user has to pick the project's recording again. */
  openProject(ref?: FileRef): Promise<{ path: FileRef; project: Project } | null>
  /** Asks the user for the recording a NeedsFile error names; true once the project can open. */
  locateFile?(project: FileRef): Promise<boolean>
  recentProjects(): Promise<RecentProject[]>
  clearRecent(): Promise<void>

  tutorialFiles(): Promise<{ audio: FileRef; cue: FileRef } | null>
  getPrefs(): Promise<Preferences>
  setPrefs(patch: Partial<Preferences>): Promise<Preferences>

  search(provider: SearchResult['provider'], q: string): Promise<SearchResult[]>
  /** Saves an image from the web for the project and returns it. */
  downloadArt(url: string): Promise<FileRef>
  /** Artwork for a song, from the local cache when it's been looked up before. */
  autoArtwork(artist: string, title: string): Promise<{ artwork: FileRef; url: string; source: string } | null>

  /** The export writes the encoded H.264 stream through these; the platform adds the audio. */
  /** `ticketId`: the export ticket the video was made with, written into its metadata. */
  exportBegin(p: ProjectFile, out: FileRef, range?: ExportRange, ticketId?: string): Promise<void>
  /** `info`: the frame's timing, for a platform that writes the MP4 itself (the web). */
  exportChunk(data: Uint8Array, info?: { timestamp: number; duration: number; key: boolean; decoderConfig?: VideoDecoderConfig }): void
  exportFinish(): Promise<FileRef>
  exportAbort(): Promise<void>

  /** Whether the project has changes not yet saved (the page warns before it's left). */
  setUnsaved?(unsaved: boolean): void
  /** The page is being left or hidden: save what isn't saved yet. */
  onBeforeClose(cb: () => void): () => void
  openExternal(url: string): void
}
