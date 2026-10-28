import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { ExportRange, Preferences, Project, RecentProject, SearchResult, Waveform } from '@shared/types'
import type { ParsedEntry } from '@shared/tracklist'

function on<T>(channel: string, cb: (payload: T) => void) {
  const fn = (_e: unknown, p: T) => cb(p)
  ipcRenderer.on(channel, fn)
  return () => void ipcRenderer.removeListener(channel, fn)
}

type Saved = { path: string; savedAt: string }

const api = {
  platform: process.platform,
  pathForFile: (f: File) => webUtils.getPathForFile(f),
  openAudioDialog: (): Promise<string | null> => ipcRenderer.invoke('dialog:openAudio'),
  /** One picker for a recording (optionally with its .cue) or a .djvis project. */
  openAnyDialog: (): Promise<string[]> => ipcRenderer.invoke('dialog:openAny'),
  openTracklistDialog: (): Promise<string | null> => ipcRenderer.invoke('dialog:openTracklist'),
  pickImage: (): Promise<string | null> => ipcRenderer.invoke('dialog:openImage'),
  chooseVideoPath: (defaultName: string): Promise<string | null> => ipcRenderer.invoke('dialog:saveVideo', defaultName),

  analyseAudio: (path: string): Promise<{ duration: number; waveform: Waveform; name: string }> => ipcRenderer.invoke('audio:analyse', path),
  onAudioProgress: (cb: (p: number) => void) => on('audio:progress', cb),
  detectTakeovers: (path: string, cues: number[], duration: number, songs?: Array<{ title: string; artist: string }>): Promise<Array<{ start: number; audibleAt: number; tailEnd: number } | null>> =>
    ipcRenderer.invoke('audio:takeovers', path, cues, duration, songs),
  /** Stops any analysis in progress (its promise rejects with "Analysis cancelled"). */
  cancelAnalysis: (): Promise<void> => ipcRenderer.invoke('audio:cancel'),
  readCue: (path: string): Promise<{ entries: ParsedEntry[]; text: string; name: string }> => ipcRenderer.invoke('tracklist:read', path),

  /** Writes a new project into the projects folder and returns where. */
  createProject: (p: Project): Promise<Saved> => ipcRenderer.invoke('project:create', p),
  saveProject: (p: Project, path: string): Promise<Saved> => ipcRenderer.invoke('project:save', p, path),
  saveProjectAs: (p: Project, current: string | null): Promise<Saved | null> => ipcRenderer.invoke('project:saveAs', p, current),
  openProject: (path?: string): Promise<{ path: string; project: Project } | null> => ipcRenderer.invoke('project:open', path),
  recentProjects: (): Promise<RecentProject[]> => ipcRenderer.invoke('recent:list'),
  clearRecent: (): Promise<void> => ipcRenderer.invoke('recent:clear'),

  tutorialFiles: (): Promise<{ audio: string; cue: string } | null> => ipcRenderer.invoke('tutorial:files'),
  getPrefs: (): Promise<Preferences> => ipcRenderer.invoke('prefs:get'),
  setPrefs: (patch: Partial<Preferences>): Promise<Preferences> => ipcRenderer.invoke('prefs:set', patch),
  chooseFolder: (current?: string): Promise<string | null> => ipcRenderer.invoke('dialog:chooseFolder', current),

  search: (provider: SearchResult['provider'], q: string): Promise<SearchResult[]> => ipcRenderer.invoke('search', provider, q),
  downloadArt: (url: string): Promise<string> => ipcRenderer.invoke('art:download', url),
  /** YouTube thumbnail for a song, from the local cache when it's been looked up before. */
  autoArtwork: (artist: string, title: string): Promise<{ artwork: string; url: string } | null> => ipcRenderer.invoke('art:auto', artist, title),

  exportBegin: (p: Project, outPath: string, range?: ExportRange): Promise<void> => ipcRenderer.invoke('export:begin', p, outPath, range),
  exportChunk: (data: Uint8Array) => ipcRenderer.send('export:chunk', data),
  exportFinish: (): Promise<string> => ipcRenderer.invoke('export:finish'),
  exportAbort: (): Promise<void> => ipcRenderer.invoke('export:abort'),

  onOpenPath: (cb: (path: string) => void) => on('app:open-path', cb),
  /** Commands from the native macOS menu. */
  onMenuCommand: (cb: (id: string) => void) => on('menu:command', cb),
  /** The window is about to close: save, then call closeOk(). */
  onBeforeClose: (cb: () => void) => on('app:before-close', cb),
  closeOk: () => ipcRenderer.send('app:close-ok'),
  quit: () => ipcRenderer.invoke('app:quit'),
  toggleDevTools: () => ipcRenderer.invoke('app:devtools'),
  toggleFullScreen: () => ipcRenderer.invoke('app:fullscreen'),
  reveal: (path: string) => ipcRenderer.invoke('shell:reveal', path),
  openExternal: (url: string) => ipcRenderer.invoke('shell:open', url)
}

export type Api = typeof api
contextBridge.exposeInMainWorld('api', api)
