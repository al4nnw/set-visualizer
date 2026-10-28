import { app, BrowserWindow, dialog, ipcMain, protocol, shell } from 'electron'
import { spawn } from 'node:child_process'
import { createReadStream, createWriteStream, type WriteStream } from 'node:fs'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
import { Readable } from 'node:stream'
import type { Project, SearchResult } from '@shared/types'
import { parseTracklist } from '@shared/tracklist'
import { detectTakeovers } from '@shared/takeover'
import { analyseAudio, spectralFrames } from './audio'
import { downloadArt, importLocalArt } from './art'
import { createAutoArt } from './autoArt'
import { ffmpegPath } from './ffmpeg'
import { identifySet } from './identify'
import { search } from './search'

protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true, corsEnabled: true } }
])

const AUDIO_EXT = ['wav', 'mp3', 'flac', 'aiff', 'aif', 'm4a', 'aac', 'ogg', 'opus']
const MIME: Record<string, string> = {
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.aiff': 'audio/aiff', '.aif': 'audio/aiff',
  '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.opus': 'audio/ogg',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp'
}

const artDir = () => join(app.getPath('userData'), 'art')
const settingsFile = () => join(app.getPath('userData'), 'settings.json')

interface AppSettings {
  auddToken?: string
  recent?: string[]
}

async function readSettings(): Promise<AppSettings> {
  try {
    return JSON.parse(await readFile(settingsFile(), 'utf8'))
  } catch {
    return {}
  }
}
async function writeSettings(patch: Partial<AppSettings>) {
  const s = { ...(await readSettings()), ...patch }
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(settingsFile(), JSON.stringify(s, null, 2))
  return s
}

/** Serves local files to the renderer as media://file/<encoded path>, with Range support for seeking. */
function registerMediaProtocol() {
  protocol.handle('media', async (req) => {
    const url = new URL(req.url)
    const file = decodeURIComponent(url.pathname.slice(1))
    let size: number
    try {
      size = (await stat(file)).size
    } catch {
      return new Response('Not found', { status: 404 })
    }
    const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream'
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') ?? '')
    if (range) {
      const start = range[1] ? parseInt(range[1], 10) : 0
      const end = range[2] ? Math.min(parseInt(range[2], 10), size - 1) : size - 1
      const body = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream
      return new Response(body, {
        status: 206,
        headers: { 'content-type': type, 'content-length': String(end - start + 1), 'content-range': `bytes ${start}-${end}/${size}`, 'accept-ranges': 'bytes' }
      })
    }
    const body = Readable.toWeb(createReadStream(file)) as ReadableStream
    return new Response(body, { headers: { 'content-type': type, 'content-length': String(size), 'accept-ranges': 'bytes' } })
  })
}

let win: BrowserWindow | null = null
const OPENABLE = new RegExp(`\\.(djvis|${AUDIO_EXT.join('|')})$`, 'i')
let pendingOpen: string | null = null

// macOS: files dropped on the dock icon / opened from Finder.
app.on('open-file', (e, path) => {
  e.preventDefault()
  if (win?.webContents && !win.webContents.isLoading()) send('app:open-path', path)
  else pendingOpen = path
})

function createWindow() {
  win = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0a0a10',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      backgroundThrottling: false
    }
  })
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
  win.webContents.on('did-finish-load', () => {
    const file = pendingOpen ?? process.argv.slice(1).find((a) => OPENABLE.test(a))
    pendingOpen = null
    if (file) send('app:open-path', file)
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

const send = (channel: string, payload: unknown) => win?.webContents.send(channel, payload)

// ---- Identification -------------------------------------------------------------------------
let identifyAbort: AbortController | null = null

// ---- Export -------------------------------------------------------------------------------
interface WebCodecsExport {
  dir: string
  videoPath: string
  stream: WriteStream
  outPath: string
  project: Project
}
let wcExport: WebCodecsExport | null = null

function mux(videoPath: string, fps: number, audioPath: string, duration: number, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, [
      '-hide_banner', '-loglevel', 'error', '-y',
      // The raw stream's own timing info can be off (OpenH264 reports 60/1), so force the rate.
      '-fflags', '+genpts', '-r', String(fps), '-f', 'h264', '-i', videoPath,
      '-i', audioPath,
      '-map', '0:v:0', '-map', '1:a:0',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-ar', '48000',
      '-t', String(duration), '-movflags', '+faststart', outPath
    ])
    let err = ''
    p.stderr.on('data', (d) => (err += d))
    p.on('error', reject)
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg mux failed: ${err.slice(-800)}`))))
  })
}

function registerIpc() {
  ipcMain.handle('dialog:openAudio', async () => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openFile'], filters: [{ name: 'Audio', extensions: AUDIO_EXT }] })
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.handle('dialog:openTracklist', async () => {
    const r = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      filters: [{ name: 'Tracklist', extensions: ['cue', 'txt', 'm3u', 'm3u8', 'csv'] }]
    })
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.handle('dialog:openImage', async () => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openFile'], filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }] })
    return r.canceled ? null : importLocalArt(r.filePaths[0], artDir())
  })
  ipcMain.handle('dialog:saveVideo', async (_e, defaultName: string) => {
    const r = await dialog.showSaveDialog(win!, { defaultPath: defaultName, filters: [{ name: 'MP4 video', extensions: ['mp4'] }] })
    return r.canceled ? null : r.filePath
  })

  ipcMain.handle('audio:analyse', async (_e, path: string) => {
    const { duration, waveform } = await analyseAudio(path, (p) => send('audio:progress', p))
    return { duration, waveform, name: basename(path) }
  })
  ipcMain.handle('audio:takeovers', async (_e, path: string, cues: number[], duration: number, songs?: Array<{ title: string; artist: string }>) =>
    detectTakeovers(await spectralFrames(path), cues, duration, songs)
  )
  ipcMain.handle('tracklist:parse', async (_e, path: string) => parseTracklist(basename(path), await readFile(path)))

  ipcMain.handle('project:save', async (_e, project: Project, path: string | null) => {
    let target = path
    if (!target) {
      const r = await dialog.showSaveDialog(win!, {
        defaultPath: project.audioName.replace(/\.[^.]+$/, '') + '.djvis',
        filters: [{ name: 'Set Visualizer project', extensions: ['djvis'] }]
      })
      if (r.canceled || !r.filePath) return null
      target = r.filePath
    }
    await writeFile(target, JSON.stringify(project))
    return target
  })
  ipcMain.handle('project:open', async (_e, path?: string) => {
    let target = path
    if (!target) {
      const r = await dialog.showOpenDialog(win!, { properties: ['openFile'], filters: [{ name: 'Set Visualizer project', extensions: ['djvis'] }] })
      if (r.canceled) return null
      target = r.filePaths[0]
    }
    return { path: target, project: JSON.parse(await readFile(target, 'utf8')) as Project }
  })

  ipcMain.handle('settings:get', () => readSettings())
  ipcMain.handle('settings:set', (_e, patch: Partial<AppSettings>) => writeSettings(patch))

  ipcMain.handle('search', (_e, provider: SearchResult['provider'], q: string) => search(provider, q))
  ipcMain.handle('art:download', (_e, url: string) => downloadArt(url, artDir()))
  const autoArt = createAutoArt(artDir())
  ipcMain.handle('art:auto', (_e, artist: string, title: string) => autoArt(artist, title))

  ipcMain.handle('identify:start', async (_e, o: { audioPath: string; duration: number; interval: number }) => {
    const { auddToken } = await readSettings()
    if (!auddToken) throw new Error('Add your AudD API token in Settings first.')
    identifyAbort?.abort()
    identifyAbort = new AbortController()
    return identifySet({
      ...o,
      token: auddToken,
      signal: identifyAbort.signal,
      onHit: (hit) => send('identify:hit', hit),
      onProgress: (done, total) => send('identify:progress', { done, total })
    })
  })
  ipcMain.handle('identify:cancel', () => identifyAbort?.abort())

  // The renderer draws and encodes H.264 with WebCodecs (hardware encoder when available) and streams the chunks here.
  ipcMain.handle('export:begin', async (_e, project: Project, outPath: string) => {
    if (wcExport) wcExport.stream.destroy()
    const dir = join(tmpdir(), `setvis-${Date.now()}`)
    await mkdir(dir, { recursive: true })
    const videoPath = join(dir, 'video.h264')
    wcExport = { dir, videoPath, stream: createWriteStream(videoPath), outPath, project }
  })
  ipcMain.on('export:chunk', (_e, data: Uint8Array) => {
    wcExport?.stream.write(Buffer.from(data.buffer, data.byteOffset, data.byteLength))
  })
  ipcMain.handle('export:finish', async () => {
    const job = wcExport
    if (!job) throw new Error('No export in progress')
    await new Promise<void>((r) => job.stream.end(r))
    try {
      await mux(job.videoPath, job.project.settings.fps, job.project.audioPath, job.project.duration, job.outPath)
    } finally {
      await rm(job.dir, { recursive: true, force: true })
      wcExport = null
    }
    return job.outPath
  })
  ipcMain.handle('export:abort', async () => {
    const job = wcExport
    wcExport = null
    if (job) {
      job.stream.destroy()
      await rm(job.dir, { recursive: true, force: true })
    }
  })

  ipcMain.handle('shell:reveal', (_e, path: string) => shell.showItemInFolder(path))
  ipcMain.handle('shell:open', (_e, url: string) => shell.openExternal(url))
}

app.whenReady().then(() => {
  registerMediaProtocol()
  registerIpc()
  createWindow()
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
