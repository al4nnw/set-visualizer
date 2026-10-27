import type { ExportProgress, Project } from '@shared/types'
import { api, errMsg } from '../api'
import { SCENE_FONTS } from '../fonts'

export const webCodecsAvailable = () => typeof VideoEncoder !== 'undefined'

/** Render workers for the GPU export. More than two barely helps: Chromium draws all canvases in one GPU process. */
const GPU_RENDER_WORKERS = 2

const newRenderWorker = () => new Worker(new URL('./encodeWorker.ts', import.meta.url), { type: 'module' })

/**
 * Renders the project to `outPath` with the same scene code as the preview.
 * CPU: one worker draws and encodes with WebCodecs, and the main process adds the audio afterwards.
 * GPU (an ffmpeg with NVENC was found): a few workers draw interleaved frames and convert them to
 * NV12 on the GPU, and a writer worker feeds them in order to ffmpeg, which encodes with NVENC and
 * adds the audio. Frames never pass through the main thread.
 */
export async function runExport(
  project: Project,
  outPath: string,
  onProgress: (p: ExportProgress) => void,
  signal: AbortSignal
): Promise<string> {
  const { fps } = project.settings
  const totalFrames = Math.ceil(project.duration * fps)
  const started = performance.now()
  let done = 0
  const gpuBin = project.settings.encoder === 'gpu' ? await api.gpuFfmpegPath().catch(() => null) : null
  const encoder = gpuBin ? 'GPU (NVIDIA NVENC)' : 'CPU (WebCodecs)'
  const report = (stage: ExportProgress['stage'], extra: Partial<ExportProgress> = {}) => {
    const rate = done / Math.max(0.001, (performance.now() - started) / 1000)
    onProgress({ frame: done, totalFrames, fps: rate, etaSec: rate > 0 ? (totalFrames - done) / rate : 0, stage, encoder, ...extra })
  }

  if (!gpuBin) await api.exportBegin(project, outPath)
  report('preparing')
  // The worker that reports progress and completion: the writer for GPU, the only render worker for CPU.
  const lead = gpuBin ? new Worker(new URL('./writerWorker.ts', import.meta.url), { type: 'module' }) : newRenderWorker()
  const renderers = gpuBin ? Array.from({ length: GPU_RENDER_WORKERS }, newRenderWorker) : [lead]
  const all = gpuBin ? [lead, ...renderers] : [lead]
  const abort = () => all.forEach((w) => w.postMessage({ type: 'cancel' }))
  signal.addEventListener('abort', abort)
  try {
    await new Promise<void>((resolve, reject) => {
      let last = 0
      lead.onmessage = (e: MessageEvent) => {
        const m = e.data
        if (m.type === 'chunk') api.exportChunk(m.data)
        else if (m.type === 'progress') {
          done += m.frames
          if (performance.now() - last > 250) {
            last = performance.now()
            report('rendering')
          }
        } else if (m.type === 'done') resolve()
        else if (m.type === 'cancelled') reject(new Error('Export cancelled'))
        else if (m.type === 'error') reject(new Error(m.message))
      }
      for (const w of all) w.onerror = (e) => reject(new Error(e.message || 'Render worker crashed'))

      if (!gpuBin) {
        lead.postMessage({ type: 'start', project, fonts: SCENE_FONTS, mode: 'webcodecs' })
        return
      }
      const channels = renderers.map(() => new MessageChannel())
      const ports = channels.map((c) => c.port1)
      lead.postMessage({ type: 'start', bin: gpuBin, project, outPath, total: totalFrames, ports }, ports)
      renderers.forEach((w, index) =>
        w.postMessage(
          { type: 'start', project, fonts: SCENE_FONTS, mode: 'raw', index, count: renderers.length, port: channels[index].port2 },
          [channels[index].port2]
        )
      )
    })
    report('finishing')
    const out = gpuBin ? outPath : await api.exportFinish()
    done = totalFrames
    report('done', { outputPath: out })
    return out
  } catch (e) {
    if (!gpuBin) await api.exportAbort()
    throw new Error(errMsg(e))
  } finally {
    signal.removeEventListener('abort', abort)
    all.forEach((w) => w.terminate())
  }
}
