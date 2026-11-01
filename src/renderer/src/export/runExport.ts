import { BRAND, forDisk, type ExportProgress, type ExportRange, type Project } from '@shared/types'
import type { ChunkInfo } from '../platform/webExport'
import { errMsg, platform } from '../platform'
import { SCENE_FONTS } from '../fonts'
import { i18n } from '../i18n'
import { checkTicket } from '../account/ticket'
import { currentUid } from '../account/account'

export const webCodecsAvailable = () => typeof VideoEncoder !== 'undefined'

/** Frames [firstFrame, endFrame) of the set, or of `range` within it. */
export function frameSpan(project: Project, range?: ExportRange) {
  const { fps } = project.settings
  const from = Math.max(0, range?.from ?? 0)
  const to = Math.min(project.duration, range?.to ?? project.duration)
  const firstFrame = Math.floor(from * fps)
  return { firstFrame, endFrame: Math.max(firstFrame + 1, Math.ceil(to * fps)) }
}

/**
 * How many render workers an export runs: one per core, less one for the page and the audio, at
 * most 4 (more gave nothing in tests: the encoders already use spare cores of their own).
 */
export const exportWorkerCount = (cores = navigator.hardwareConcurrency || 2) => Math.max(1, Math.min(4, cores - 1))

/**
 * While the editor plays something (the set or a clip preview), an export keeps one worker going
 * and lets the others wait, so the preview stays smooth; they pick up again when it stops.
 */
let editorPlaying = false
const resumers = new Set<() => void>()
export function setEditorPlaying(playing: boolean) {
  if (playing === editorPlaying) return
  editorPlaying = playing
  if (!playing) for (const r of resumers) r()
}

/**
 * Frames per part: three 2 s keyframe intervals. Parts start on the export's own keyframes, so
 * splitting it doesn't change where they fall.
 */
const partFrames = (fps: number) => fps * 2 * 3

/**
 * Renders the project to `outPath`. Several workers draw frames with the same scene code as the
 * preview and encode them with WebCodecs (hardware encoder when available), each taking the next
 * part of the video when it's free; their parts are handed on in order to be put together with
 * the original audio. With `range`, only that stretch of the set (a clip).
 */
export async function runExport(
  project: Project,
  outPath: string,
  onProgress: (p: ExportProgress) => void,
  signal: AbortSignal,
  range?: ExportRange,
  /** The server's signed permission for this export (see account/ticket.ts). */
  ticket?: string
): Promise<string> {
  const { fps } = project.settings
  const { firstFrame, endFrame } = frameSpan(project, range)
  const totalFrames = endFrame - firstFrame
  const started = performance.now()
  let done = 0
  const report = (stage: ExportProgress['stage'], extra: Partial<ExportProgress> = {}) => {
    const rate = done / Math.max(0.001, (performance.now() - started) / 1000)
    onProgress({ frame: done, totalFrames, fps: rate, etaSec: rate > 0 ? (totalFrames - done) / rate : 0, stage, ...extra })
  }

  const t = await checkTicket(ticket, { kind: range ? 'clip' : 'set', uid: currentUid() })
  await platform.exportBegin(forDisk(project), outPath, range, t.id)
  report('preparing')
  const parts = Math.ceil(totalFrames / partFrames(fps))
  const workers = Array.from({ length: Math.min(exportWorkerCount(), parts) }, () => new Worker(new URL('./encodeWorker.ts', import.meta.url), { type: 'module' }))
  let rejectRun: (e: Error) => void = () => {}
  let cleanup = () => {}
  const abort = () => {
    for (const w of workers) w.postMessage({ type: 'cancel' })
    rejectRun(new Error(i18n.t('errors.exportCancelled')))
  }
  signal.addEventListener('abort', abort)
  try {
    await new Promise<void>((resolve, reject) => {
      rejectRun = reject
      if (signal.aborted) return abort()
      let last = 0
      // Parts handed out, and the next one to pass on. Parts that finish early wait here, at
      // most a couple per worker ahead, so memory stays small however long the set is.
      let given = 0
      let active = 0
      let emitting = 0
      let starting = workers.length
      let startError = ''
      const ready = new Set<Worker>()
      const idle: Worker[] = []
      const waiting = new Map<number, { chunks: Uint8Array[]; infos: ChunkInfo[]; done: boolean }>()
      const partOf = (i: number) => {
        let p = waiting.get(i)
        if (!p) waiting.set(i, (p = { chunks: [], infos: [], done: false }))
        return p
      }
      const give = (w: Worker) => {
        if (given >= parts || given >= emitting + 2 * ready.size || (editorPlaying && active > 0)) return void idle.push(w)
        active++
        const from = firstFrame + given * partFrames(fps)
        w.postMessage({ type: 'part', index: given, from, to: Math.min(endFrame, from + partFrames(fps)) })
        given++
      }
      // Passes on everything of the part being emitted, and moves on while parts are complete.
      const flush = () => {
        for (;;) {
          const p = waiting.get(emitting)
          if (!p) return
          p.chunks.forEach((c, k) => {
            const info = p.infos[k]
            // The very first frame in the file carries the decoder config; later copies are dropped.
            if (info.decoderConfig && configSent) info.decoderConfig = undefined
            else if (info.decoderConfig) configSent = true
            platform.exportChunk(c, info)
          })
          p.chunks = []
          p.infos = []
          if (!p.done) return
          waiting.delete(emitting)
          if (++emitting === parts) return resolve()
          for (const w of idle.splice(0)) give(w)
        }
      }
      let configSent = false
      const resume = () => {
        for (const w of idle.splice(0)) give(w)
      }
      resumers.add(resume)
      cleanup = () => resumers.delete(resume)
      for (const worker of workers) {
        worker.onmessage = (e: MessageEvent) => {
          const m = e.data
          if (m.type === 'chunk') {
            const p = partOf(m.part)
            p.chunks.push(m.data)
            p.infos.push(m)
            if (m.part === emitting) flush()
          } else if (m.type === 'progress') {
            done += m.frames
            if (performance.now() - last > 250) {
              last = performance.now()
              report('rendering')
            }
          } else if (m.type === 'partDone') {
            active--
            partOf(m.index).done = true
            flush()
            give(worker)
          } else if (m.type === 'ready') {
            starting--
            ready.add(worker)
            give(worker)
          } else if (m.type === 'startFailed') {
            // Fewer workers (a hardware encoder may allow only a few at once); none at all fails.
            starting--
            startError ||= m.message
            worker.terminate()
            if (!starting && !ready.size) reject(new Error(startError))
          } else if (m.type === 'error') reject(new Error(m.message))
        }
        worker.onerror = (e) => reject(new Error(e.message || i18n.t('errors.workerCrashed')))
      }
      // The workers have no platform of their own: they get the artwork as URLs they can fetch.
      // The watermark comes from the signed ticket: REKCUT on free exports, none on a paid plan.
      const withUrls = { ...project, settings: { ...project.settings, djName: t.paid ? '' : BRAND }, tracks: project.tracks.map((t) => (t.artwork ? { ...t, artwork: platform.mediaUrl(t.artwork) } : t)) }
      for (const w of workers) w.postMessage({ type: 'start', project: withUrls, fonts: SCENE_FONTS, firstFrame, endFrame })
    })
    report('finishing')
    const out = await platform.exportFinish()
    done = totalFrames
    report('done', { outputPath: out })
    return out
  } catch (e) {
    await platform.exportAbort()
    throw new Error(errMsg(e))
  } finally {
    signal.removeEventListener('abort', abort)
    cleanup()
    for (const w of workers) w.terminate()
  }
}
