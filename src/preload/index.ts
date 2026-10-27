import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { IdentifyHit, Project, SearchResult, Waveform } from '@shared/types'
import type { ParsedEntry } from '@shared/tracklist'
import { startGpuExport, type GpuExport } from '../main/gpuEncoder'

function on<T>(channel: string, cb: (payload: T) => void) {
  const fn = (_e: unknown, p: T) => cb(p)
  ipcRenderer.on(channel, fn)
  return () => void ipcRenderer.removeListener(channel, fn)
}

let gpuJob: GpuExport | null = null

const api = {
  platform: process.platform,
  pathForFile: (f: File) => webUtils.getPathForFile(f),
  openAudioDialog: (): Promise<string | null> => ipcRenderer.invoke('dialog:openAudio'),
  openTracklistDialog: (): Promise<string | null> => ipcRenderer.invoke('dialog:openTracklist'),
  pickImage: (): Promise<string | null> => ipcRenderer.invoke('dialog:openImage'),
  chooseVideoPath: (defaultName: string): Promise<string | null> => ipcRenderer.invoke('dialog:saveVideo', defaultName),

  analyseAudio: (path: string): Promise<{ duration: number; waveform: Waveform; name: string }> => ipcRenderer.invoke('audio:analyse', path),
  onAudioProgress: (cb: (p: number) => void) => on('audio:progress', cb),
  detectTakeovers: (path: string, cues: number[], duration: number, songs?: Array<{ title: string; artist: string }>): Promise<Array<{ start: number; audibleAt: number; tailEnd: number } | null>> =>
    ipcRenderer.invoke('audio:takeovers', path, cues, duration, songs),
  parseTracklist: (path: string): Promise<ParsedEntry[]> => ipcRenderer.invoke('tracklist:parse', path),

  saveProject: (p: Project, path: string | null): Promise<string | null> => ipcRenderer.invoke('project:save', p, path),
  openProject: (path?: string): Promise<{ path: string; project: Project } | null> => ipcRenderer.invoke('project:open', path),

  getSettings: (): Promise<{ auddToken?: string }> => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: { auddToken?: string }) => ipcRenderer.invoke('settings:set', patch),

  search: (provider: SearchResult['provider'], q: string): Promise<SearchResult[]> => ipcRenderer.invoke('search', provider, q),
  downloadArt: (url: string): Promise<string> => ipcRenderer.invoke('art:download', url),
  /** YouTube thumbnail for a song, from the local cache when it's been looked up before. */
  autoArtwork: (artist: string, title: string): Promise<{ artwork: string; url: string } | null> => ipcRenderer.invoke('art:auto', artist, title),

  identify: (o: { audioPath: string; duration: number; interval: number }): Promise<IdentifyHit[]> => ipcRenderer.invoke('identify:start', o),
  cancelIdentify: () => ipcRenderer.invoke('identify:cancel'),
  onIdentifyHit: (cb: (h: IdentifyHit) => void) => on('identify:hit', cb),
  onIdentifyProgress: (cb: (p: { done: number; total: number }) => void) => on('identify:progress', cb),

  exportBegin: (p: Project, outPath: string): Promise<void> => ipcRenderer.invoke('export:begin', p, outPath),
  /** True when an ffmpeg with a working NVIDIA encoder was found. */
  gpuExportAvailable: async (): Promise<boolean> => !!(await ipcRenderer.invoke('export:gpuFfmpeg')),
  // The GPU encoder runs from here, in the renderer process, so frames skip the IPC copy to main.
  gpuExportBegin: async (p: Project, outPath: string): Promise<void> => {
    const bin: string | null = await ipcRenderer.invoke('export:gpuFfmpeg')
    if (!bin) throw new Error('No ffmpeg with NVENC found')
    gpuJob?.abort()
    gpuJob = startGpuExport(bin, p, outPath)
  },
  /** One NV12 frame; resolves when the encoder can take more. */
  gpuExportFrame: (frame: Uint8Array): Promise<void> => (gpuJob ? gpuJob.write(frame) : Promise.reject(new Error('No export in progress'))),
  gpuExportFinish: async (): Promise<void> => {
    const job = gpuJob
    if (!job) throw new Error('No export in progress')
    try {
      await job.finish()
    } finally {
      gpuJob = null
    }
  },
  gpuExportAbort: async (): Promise<void> => {
    gpuJob?.abort()
    gpuJob = null
  },
  exportChunk: (data: Uint8Array) => ipcRenderer.send('export:chunk', data),
  exportFinish: (): Promise<string> => ipcRenderer.invoke('export:finish'),
  exportAbort: (): Promise<void> => ipcRenderer.invoke('export:abort'),

  onOpenPath: (cb: (path: string) => void) => on('app:open-path', cb),
  reveal: (path: string) => ipcRenderer.invoke('shell:reveal', path),
  openExternal: (url: string) => ipcRenderer.invoke('shell:open', url)
}

export type Api = typeof api
contextBridge.exposeInMainWorld('api', api)
