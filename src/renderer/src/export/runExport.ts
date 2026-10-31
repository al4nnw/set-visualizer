import { forDisk, type ExportProgress, type ExportRange, type Project } from '@shared/types'
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
 * Renders the project to `outPath`: a worker draws every frame with the same scene code as the
 * preview and encodes it with WebCodecs (hardware encoder when available); the main process then
 * adds the original audio. With `range`, only that stretch of the set (a clip).
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
  const worker = new Worker(new URL('./encodeWorker.ts', import.meta.url), { type: 'module' })
  const abort = () => worker.postMessage({ type: 'cancel' })
  signal.addEventListener('abort', abort)
  try {
    await new Promise<void>((resolve, reject) => {
      let last = 0
      worker.onmessage = (e: MessageEvent) => {
        const m = e.data
        if (m.type === 'chunk') platform.exportChunk(m.data, m)
        else if (m.type === 'progress') {
          done += m.frames
          if (performance.now() - last > 250) {
            last = performance.now()
            report('rendering')
          }
        } else if (m.type === 'done') resolve()
        else if (m.type === 'cancelled') reject(new Error(i18n.t('errors.exportCancelled')))
        else if (m.type === 'error') reject(new Error(m.message))
      }
      worker.onerror = (e) => reject(new Error(e.message || i18n.t('errors.workerCrashed')))
      // The worker has no platform of its own: it gets the artwork as URLs it can fetch.
      const withUrls = { ...project, tracks: project.tracks.map((t) => (t.artwork ? { ...t, artwork: platform.mediaUrl(t.artwork) } : t)) }
      worker.postMessage({ type: 'start', project: withUrls, fonts: SCENE_FONTS, firstFrame, endFrame })
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
    worker.terminate()
  }
}
