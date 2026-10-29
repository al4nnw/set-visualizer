/// <reference lib="webworker" />
/**
 * One thread of the browser analysis (see index.ts). It analyses the segments of a set it is given,
 * reading a WAV/AIFF file itself or fed decoded audio by the decoder worker, and runs takeover
 * detection off the page's thread.
 */
import { unpackSpectrum, type SegmentAnalysis } from '@shared/analysis'
import { analyseSegment, createSegmentPipeline } from '@shared/analyseSource'
import { pcmSource } from '@shared/pcm'
import { detectTakeovers } from '@shared/takeover'
import type { FeedMessage, FeedReply, WorkerJob, WorkerReply } from './protocol'

const post = (m: WorkerReply, transfer: Transferable[] = []) => postMessage(m, transfer)
const message = (e: unknown) => String((e as Error)?.message ?? e)

/** The spectrum's buffers move to the page instead of being copied. */
const transfers = (r: SegmentAnalysis) => (r.spectrum ? [r.spectrum.frames.buffer, r.spectrum.power.buffer, r.spectrum.totals.buffer] : [])

self.onmessage = async (e: MessageEvent<WorkerJob>) => {
  const job = e.data
  if (job.type === 'feed') return feed(job.port)
  try {
    if (job.type === 'pcm') {
      const onProgress = (seconds: number) => post({ type: 'progress', id: job.id, seconds })
      const result = await analyseSegment(pcmSource(job.file, job.layout), job.range, { spectrum: true, onProgress })
      post({ type: 'segment', id: job.id, result }, transfers(result))
    } else {
      post({ type: 'takeovers', id: job.id, result: detectTakeovers(unpackSpectrum(job.spectrum), job.cues, job.duration, job.songs) })
    }
  } catch (err) {
    post({ type: 'error', id: job.id, message: message(err) })
  }
}

/** Segments the decoder sends over `port`, one at a time. */
function feed(port: MessagePort) {
  let seg: { id: number; from: number; sampleRate: number; pipeline: ReturnType<typeof createSegmentPipeline>; reported: number } | null = null
  port.onmessage = (e: MessageEvent<FeedMessage>) => {
    const m = e.data
    try {
      if (m.type === 'begin') {
        seg = { id: m.id, from: m.range.from, sampleRate: m.sampleRate, pipeline: createSegmentPipeline(m.sampleRate, m.range, { spectrum: true }), reported: 0 }
      } else if (m.type === 'chunk' && seg) {
        seg.pipeline.push(m.samples, m.at)
        const seconds = (m.at + m.samples.length) / seg.sampleRate - seg.from
        if (seconds - seg.reported >= 0.5) {
          seg.reported = seconds
          post({ type: 'progress', id: seg.id, seconds })
        }
      } else if (m.type === 'end' && seg) {
        const result = seg.pipeline.finish(m.atEnd)
        seg = null
        post({ type: 'segment', id: m.id, result }, transfers(result))
        port.postMessage({ type: 'free' } satisfies FeedReply)
      }
    } catch (err) {
      post({ type: 'error', id: m.id, message: message(err) })
    }
  }
}
