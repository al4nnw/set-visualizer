/**
 * The set analysis in the browser: the waveform and spectral frames the desktop app gets from ffmpeg
 * (src/main/audio.ts), computed on the computer's own cores, so the recording never leaves it.
 * WAV and AIFF recordings are read straight from the file by every worker, each taking the next
 * segment of the set. Compressed ones are decoded once, in order, by a decoder worker that hands
 * each segment to whichever worker is free.
 */
import { mergeSegments, packSpectrum, type PackedSpectrum, type SegmentAnalysis } from '@shared/analysis'
import { planSegments } from '@shared/analyseSource'
import { probePcm, type PcmLayout } from '@shared/pcm'
import type { Waveform } from '@shared/types'
import type { CompressedInfo } from './decode'
import type { DecoderJob, DecoderReply, Song, Takeover, WorkerJob, WorkerReply } from './protocol'

export type { Song, Takeover } from './protocol'

export interface AnalysisResult {
  duration: number
  waveform: Waveform
  spectrum: PackedSpectrum
  /** 'wav', 'aiff', or the codec it was decoded from. */
  codec: string
}

/**
 * Why an analysis failed: `format` (not an audio file Mediabunny can read), `noAudio`, `codec` (this
 * browser has no decoder for `codec`), `cancelled`, or `failed` (anything else; see the message).
 */
export class AnalysisError extends Error {
  constructor(
    readonly reason: 'format' | 'noAudio' | 'codec' | 'cancelled' | 'failed',
    message: string,
    readonly codec?: string
  ) {
    super(message)
  }
}

export interface AnalyseOptions {
  /** Share of the set analysed so far, 0 to 1 (a few times a second). */
  onProgress?: (p: number) => void
  signal?: AbortSignal
  /** Threads to use; all the cores by default (up to 8). */
  threads?: number
}

const segmentWorker = () => new Worker(new URL('./segmentWorker.ts', import.meta.url), { type: 'module' })
const decoderWorker = () => new Worker(new URL('./decoderWorker.ts', import.meta.url), { type: 'module' })

export const analysisThreads = () => Math.max(1, Math.min(8, navigator.hardwareConcurrency || 4))

const failed = (e: ErrorEvent | MessageEvent) => new AnalysisError('failed', (e as ErrorEvent).message || 'An analysis thread stopped')

/** Waveform and spectral frames for a recording, with the duration the desktop app would report. */
export async function analyseFile(file: Blob, opts: AnalyseOptions = {}): Promise<AnalysisResult> {
  const threads = opts.threads ?? analysisThreads()
  const workers: Worker[] = []
  let lastReport = -1
  const progress = (p: number) => {
    if (!opts.onProgress || p - lastReport < 0.005) return
    lastReport = p
    opts.onProgress(Math.min(1, p))
  }
  const cancelled = new Promise<never>((_, reject) => {
    const abort = () => reject(new AnalysisError('cancelled', 'Analysis cancelled'))
    if (opts.signal?.aborted) abort()
    opts.signal?.addEventListener('abort', abort, { once: true })
  })
  cancelled.catch(() => {})
  try {
    const layout = await probePcm(file)
    const run = layout ? analysePcm(file, layout, threads, workers, progress) : analyseCompressed(file, threads, workers, progress)
    const { duration, parts, codec } = await Promise.race([run, cancelled])
    const { waveform, spectrum } = mergeSegments(parts)
    return { duration, waveform, spectrum: packSpectrum(spectrum ?? { fps: 0, frames: [] }), codec }
  } finally {
    for (const w of workers) w.terminate()
  }
}

interface Analysed {
  duration: number
  parts: SegmentAnalysis[]
  codec: string
}

function analysePcm(file: Blob, layout: PcmLayout, threads: number, workers: Worker[], progress: (p: number) => void): Promise<Analysed> {
  const duration = layout.frames / layout.sampleRate
  // Several segments per thread, so threads that finish early take more.
  const plan = planSegments(duration, threads * 4)
  const parts: SegmentAnalysis[] = []
  const done = new Float64Array(plan.length)
  let next = 0
  return new Promise((resolve, reject) => {
    const start = (w: Worker) => {
      if (next >= plan.length) return
      const id = next++
      w.postMessage({ type: 'pcm', id, file, layout, range: plan[id] } satisfies WorkerJob)
    }
    const report = () => progress(done.reduce((a, b) => a + b, 0) / Math.max(1, duration))
    for (let i = 0; i < Math.min(threads, plan.length); i++) {
      const w = segmentWorker()
      workers.push(w)
      w.onmessage = (e: MessageEvent<WorkerReply>) => {
        const m = e.data
        if (m.type === 'progress') {
          done[m.id] = m.seconds
          report()
        } else if (m.type === 'segment') {
          parts.push(m.result)
          done[m.id] = (plan[m.id].to ?? duration) - plan[m.id].from
          report()
          if (parts.length === plan.length) resolve({ duration, parts, codec: layout.container })
          else start(w)
        } else if (m.type === 'error') reject(new AnalysisError('failed', m.message))
      }
      w.onerror = (e) => reject(failed(e))
      start(w)
    }
  })
}

const decodeFailure = (m: Extract<DecoderReply, { type: 'error' }>) => new AnalysisError(m.reason ?? 'failed', m.message, m.codec)

async function analyseCompressed(file: Blob, threads: number, workers: Worker[], progress: (p: number) => void): Promise<Analysed> {
  const dec = decoderWorker()
  workers.push(dec)
  const info = await new Promise<CompressedInfo>((resolve, reject) => {
    dec.onmessage = (e: MessageEvent<DecoderReply>) => {
      if (e.data.type === 'info') resolve(e.data.info)
      else if (e.data.type === 'error') reject(decodeFailure(e.data))
    }
    dec.onerror = (e) => reject(failed(e))
    dec.postMessage({ type: 'open', file } satisfies DecoderJob)
  })
  // One thread decodes; the others analyse. Segments short enough that the last one doesn't keep
  // everyone waiting, long enough that each one's warm-up costs little.
  const n = Math.max(1, threads - 1)
  const estimate = info.duration ?? 0
  const length = Math.max(20, Math.min(60, Math.round(estimate / (n * 4)) || 45))
  const parts = new Map<number, SegmentAnalysis>()
  const done = new Map<number, number>()
  return new Promise((resolve, reject) => {
    let decoded: Extract<DecoderReply, { type: 'decoded' }> | null = null
    const finish = () => {
      if (!decoded || parts.size < decoded.segments) return
      resolve({ duration: info.duration ?? decoded.frames / decoded.sampleRate, parts: [...parts.values()], codec: info.codec })
    }
    const report = () => {
      if (!estimate) return
      let s = 0
      for (const v of done.values()) s += v
      progress(s / estimate)
    }
    const ports: MessagePort[] = []
    for (let i = 0; i < n; i++) {
      const w = segmentWorker()
      workers.push(w)
      const channel = new MessageChannel()
      w.postMessage({ type: 'feed', port: channel.port1 } satisfies WorkerJob, [channel.port1])
      ports.push(channel.port2)
      w.onmessage = (e: MessageEvent<WorkerReply>) => {
        const m = e.data
        if (m.type === 'progress') {
          done.set(m.id, m.seconds)
          report()
        } else if (m.type === 'segment') {
          parts.set(m.id, m.result)
          done.set(m.id, length)
          report()
          finish()
        } else if (m.type === 'error') reject(new AnalysisError('failed', m.message))
      }
      w.onerror = (e) => reject(failed(e))
    }
    dec.onmessage = (e: MessageEvent<DecoderReply>) => {
      const m = e.data
      if (m.type === 'decoded') {
        decoded = m
        finish()
      } else if (m.type === 'error') reject(decodeFailure(m))
    }
    dec.postMessage({ type: 'run', ports, segmentLength: length } satisfies DecoderJob, ports)
  })
}

/** detectTakeovers (src/shared/takeover.ts) on a worker, so a long set doesn't block the page. */
export function detectTakeoversOffThread(spectrum: PackedSpectrum, cues: number[], duration: number, songs?: Song[]): Promise<Takeover[]> {
  const w = segmentWorker()
  return new Promise<Takeover[]>((resolve, reject) => {
    w.onmessage = (e: MessageEvent<WorkerReply>) => {
      if (e.data.type === 'takeovers') resolve(e.data.result)
      else if (e.data.type === 'error') reject(new AnalysisError('failed', e.data.message))
    }
    w.onerror = (e) => reject(failed(e))
    w.postMessage({ type: 'takeovers', id: 0, spectrum, cues, duration, songs } satisfies WorkerJob)
  }).finally(() => w.terminate())
}
