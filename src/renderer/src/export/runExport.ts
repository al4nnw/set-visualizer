import type { ExportProgress, Project } from '@shared/types'
import { api, errMsg } from '../api'
import { SCENE_FONTS } from '../fonts'

export const webCodecsAvailable = () => typeof VideoEncoder !== 'undefined'

/**
 * Renders the project to `outPath`: a worker draws every frame with the same scene code as the
 * preview. With an NVIDIA GPU (an ffmpeg with h264_nvenc on the system), raw frames go to the main
 * process, which encodes them on the GPU and adds the audio. Otherwise the worker encodes with
 * WebCodecs and the main process adds the audio afterwards.
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
  const gpu = project.settings.encoder === 'gpu' && (await api.gpuExportAvailable().catch(() => false))
  const encoder = gpu ? 'GPU (NVIDIA NVENC)' : 'CPU (WebCodecs)'
  const report = (stage: ExportProgress['stage'], extra: Partial<ExportProgress> = {}) => {
    const rate = done / Math.max(0.001, (performance.now() - started) / 1000)
    onProgress({ frame: done, totalFrames, fps: rate, etaSec: rate > 0 ? (totalFrames - done) / rate : 0, stage, encoder, ...extra })
  }

  if (gpu) await api.gpuExportBegin(project, outPath)
  else await api.exportBegin(project, outPath)
  report('preparing')
  const worker = new Worker(new URL('./encodeWorker.ts', import.meta.url), { type: 'module' })
  const abort = () => worker.postMessage({ type: 'cancel' })
  signal.addEventListener('abort', abort)
  try {
    await new Promise<void>((resolve, reject) => {
      let last = 0
      worker.onmessage = (e: MessageEvent) => {
        const m = e.data
        if (m.type === 'chunk') api.exportChunk(m.data)
        else if (m.type === 'frame')
          api.gpuExportFrame(m.data).then(
            () => worker.postMessage({ type: 'ack' }),
            (err) => reject(new Error(errMsg(err)))
          )
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
      worker.onerror = (e) => reject(new Error(e.message || 'Render worker crashed'))
      worker.postMessage({ type: 'start', project, fonts: SCENE_FONTS, mode: gpu ? 'raw' : 'webcodecs' })
    })
    report('finishing')
    let out = outPath
    if (gpu) await api.gpuExportFinish()
    else out = await api.exportFinish()
    done = totalFrames
    report('done', { outputPath: out })
    return out
  } catch (e) {
    if (gpu) await api.gpuExportAbort()
    else await api.exportAbort()
    throw new Error(errMsg(e))
  } finally {
    signal.removeEventListener('abort', abort)
    worker.terminate()
  }
}
