import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { IdentifyHit, Project, SearchResult, Waveform } from '@shared/types'
import type { ParsedEntry } from '@shared/tracklist'

function on<T>(channel: string, cb: (payload: T) => void) {
  const fn = (_e: unknown, p: T) => cb(p)
  ipcRenderer.on(channel, fn)
  return () => void ipcRenderer.removeListener(channel, fn)
}

const api = {
  platform: process.platform,
  pathForFile: (f: File) => webUtils.getPathForFile(f),
  openAudioDialog: (): Promise<string | null> => ipcRenderer.invoke('dialog:openAudio'),
  openTracklistDialog: (): Promise<string | null> => ipcRenderer.invoke('dialog:openTracklist'),
  pickImage: (): Promise<string | null> => ipcRenderer.invoke('dialog:openImage'),
  chooseVideoPath: (defaultName: string): Promise<string | null> => ipcRenderer.invoke('dialog:saveVideo', defaultName),

  analyseAudio: (path: string): Promise<{ duration: number; waveform: Waveform; name: string }> => ipcRenderer.invoke('audio:analyse', path),
  onAudioProgress: (cb: (p: number) => void) => on('audio:progress', cb),
  parseTracklist: (path: string): Promise<ParsedEntry[]> => ipcRenderer.invoke('tracklist:parse', path),

  saveProject: (p: Project, path: string | null): Promise<string | null> => ipcRenderer.invoke('project:save', p, path),
  openProject: (path?: string): Promise<{ path: string; project: Project } | null> => ipcRenderer.invoke('project:open', path),

  getSettings: (): Promise<{ auddToken?: string }> => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: { auddToken?: string }) => ipcRenderer.invoke('settings:set', patch),

  search: (provider: SearchResult['provider'], q: string): Promise<SearchResult[]> => ipcRenderer.invoke('search', provider, q),
  downloadArt: (url: string): Promise<string> => ipcRenderer.invoke('art:download', url),

  identify: (o: { audioPath: string; duration: number; interval: number }): Promise<IdentifyHit[]> => ipcRenderer.invoke('identify:start', o),
  cancelIdentify: () => ipcRenderer.invoke('identify:cancel'),
  onIdentifyHit: (cb: (h: IdentifyHit) => void) => on('identify:hit', cb),
  onIdentifyProgress: (cb: (p: { done: number; total: number }) => void) => on('identify:progress', cb),

  exportBegin: (p: Project, outPath: string): Promise<void> => ipcRenderer.invoke('export:begin', p, outPath),
  exportChunk: (data: Uint8Array) => ipcRenderer.send('export:chunk', data),
  exportFinish: (): Promise<string> => ipcRenderer.invoke('export:finish'),
  exportAbort: (): Promise<void> => ipcRenderer.invoke('export:abort'),

  onOpenPath: (cb: (path: string) => void) => on('app:open-path', cb),
  reveal: (path: string) => ipcRenderer.invoke('shell:reveal', path),
  openExternal: (url: string) => ipcRenderer.invoke('shell:open', url)
}

export type Api = typeof api
contextBridge.exposeInMainWorld('api', api)
