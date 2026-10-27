import { spawn } from 'node:child_process'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { cpus, tmpdir } from 'node:os'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas'
import { QUALITY_CRF, type ExportProgress, type Project } from '@shared/types'
import { drawFrame, makeBlurred, prepareScene, type ArtAsset, type CanvasFactory, type Ctx, type ImageLike } from '@shared/scene'
import { ffmpegPath } from '../main/ffmpeg'

export interface SegmentJob {
  project: Project
  startFrame: number
  endFrame: number
  outPath: string
  fontDir: string
}

let fontsLoaded = false
export async function registerFonts(fontDir: string) {
  if (fontsLoaded) return
  for (const f of await readdir(fontDir)) if (/\.(woff2?|ttf|otf)$/.test(f)) GlobalFonts.registerFromPath(join(fontDir, f), 'Inter')
  fontsLoaded = true
}

export const nodeCanvasFactory: CanvasFactory = (w, h) => createCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)))

export async function loadArt(project: Project): Promise<Map<string, ArtAsset>> {
  const art = new Map<string, ArtAsset>()
  await Promise.all(
    project.tracks.map(async (t) => {
      if (!t.artwork) return
      try {
        const image = (await loadImage(t.artwork)) as unknown as ImageLike
        art.set(t.id, { image, blurred: makeBlurred(image, nodeCanvasFactory) })
      } catch {
        // Missing or unreadable image: the card falls back to a placeholder.
      }
    })
  )
  return art
}

/** Renders frames [startFrame, endFrame) to a video-only H.264 file. */
export async function renderSegment(job: SegmentJob, onFrames: (n: number) => void, signal?: AbortSignal): Promise<void> {
  await registerFonts(job.fontDir)
  const { project } = job
  const { width: W, height: H, fps } = project.settings
  const prep = prepareScene(project, await loadArt(project), nodeCanvasFactory)
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d') as unknown as Ctx

  const ff = spawn(ffmpegPath, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(fps), '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-tune', 'animation', '-crf', String(QUALITY_CRF[project.settings.quality] ?? 18),
    '-pix_fmt', 'yuv420p', '-g', String(fps * 2), '-video_track_timescale', String(fps * 1000),
    '-an', job.outPath
  ])
  let stderr = ''
  ff.stderr.on('data', (d) => (stderr += d))
  const exited = new Promise<void>((resolve, reject) => {
    ff.on('error', reject)
    ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(signal?.aborted ? 'cancelled' : `ffmpeg exited ${code}: ${stderr.slice(-800)}`))))
  })
  exited.catch(() => {})
  const onAbort = () => ff.kill('SIGKILL')
  signal?.addEventListener('abort', onAbort)

  let pending = 0
  try {
    for (let f = job.startFrame; f < job.endFrame; f++) {
      if (signal?.aborted) throw new Error('cancelled')
      drawFrame(ctx, prep, f / fps)
      const ok = ff.stdin.write(canvas.data())
      pending++
      if (!ok) await new Promise<void>((r) => ff.stdin.once('drain', () => r()))
      if (pending >= 15) {
        onFrames(pending)
        pending = 0
      }
    }
    ff.stdin.end()
    await exited
    if (pending) onFrames(pending)
  } catch (e) {
    ff.kill('SIGKILL')
    await exited.catch(() => {})
    throw e
  } finally {
    signal?.removeEventListener('abort', onAbort)
  }
}

export interface ExportOptions {
  workerPath: string
  workerExecArgv?: string[]
  fontDir: string
  parallel?: number
  signal?: AbortSignal
  onProgress?: (p: ExportProgress) => void
}

/**
 * Splits the set into chunks rendered in parallel worker threads, joins the chunks and muxes
 * the original audio (AAC 320k, which YouTube handles well).
 */
export async function exportVideo(project: Project, outPath: string, o: ExportOptions): Promise<void> {
  const { fps } = project.settings
  const totalFrames = Math.ceil(project.duration * fps)
  const parallel = Math.max(1, Math.min(o.parallel ?? Math.max(1, Math.floor(cpus().length / 2)), 8, Math.ceil(totalFrames / (fps * 10))))
  const dir = await mkdtemp(join(tmpdir(), 'setvis-'))
  const started = Date.now()
  let done = 0
  const report = (stage: ExportProgress['stage'], extra: Partial<ExportProgress> = {}) => {
    const elapsed = (Date.now() - started) / 1000
    const rate = done / Math.max(0.001, elapsed)
    o.onProgress?.({ frame: done, totalFrames, fps: rate, etaSec: rate > 0 ? (totalFrames - done) / rate : 0, stage, ...extra })
  }
  report('preparing')

  const workers: Worker[] = []
  const abort = () => workers.forEach((w) => w.postMessage({ type: 'cancel' }))
  o.signal?.addEventListener('abort', abort)
  try {
    const per = Math.ceil(totalFrames / parallel)
    const segments = Array.from({ length: parallel }, (_, i) => ({
      startFrame: i * per,
      endFrame: Math.min(totalFrames, (i + 1) * per),
      outPath: join(dir, `seg${String(i).padStart(3, '0')}.mp4`)
    })).filter((s) => s.endFrame > s.startFrame)

    let lastReport = 0
    await Promise.all(
      segments.map(
        (seg) =>
          new Promise<void>((resolve, reject) => {
            const w = new Worker(o.workerPath, {
              workerData: { ...seg, project, fontDir: o.fontDir } satisfies SegmentJob,
              execArgv: o.workerExecArgv
            })
            workers.push(w)
            w.on('message', (m: { type: string; frames?: number; message?: string }) => {
              if (m.type === 'progress') {
                done += m.frames ?? 0
                if (Date.now() - lastReport > 250) {
                  lastReport = Date.now()
                  report('rendering')
                }
              } else if (m.type === 'done') resolve()
              else if (m.type === 'error') reject(new Error(m.message))
            })
            w.on('error', reject)
            w.on('exit', (code) => (code !== 0 ? reject(new Error(`render worker exited with ${code}`)) : resolve()))
          })
      )
    )
    if (o.signal?.aborted) throw new Error('cancelled')

    report('finishing')
    const list = join(dir, 'list.txt')
    await writeFile(list, segments.map((s) => `file '${s.outPath.replace(/'/g, "'\\''")}'`).join('\n'))
    await new Promise<void>((resolve, reject) => {
      const p = spawn(ffmpegPath, [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-f', 'concat', '-safe', '0', '-i', list,
        '-i', project.audioPath,
        '-map', '0:v:0', '-map', '1:a:0',
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-ar', '48000',
        '-shortest', '-movflags', '+faststart', outPath
      ])
      let err = ''
      p.stderr.on('data', (d) => (err += d))
      const kill = () => p.kill('SIGKILL')
      o.signal?.addEventListener('abort', kill)
      p.on('error', reject)
      p.on('close', (code) => {
        o.signal?.removeEventListener('abort', kill)
        code === 0 ? resolve() : reject(new Error(o.signal?.aborted ? 'cancelled' : `ffmpeg mux failed: ${err.slice(-800)}`))
      })
    })
    done = totalFrames
    report('done', { outputPath: outPath })
  } catch (e) {
    workers.forEach((w) => w.terminate())
    const cancelled = o.signal?.aborted || (e as Error).message === 'cancelled'
    report(cancelled ? 'cancelled' : 'error', { message: cancelled ? 'Export cancelled' : (e as Error).message })
    throw e
  } finally {
    o.signal?.removeEventListener('abort', abort)
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
