/// <reference lib="webworker" />
/**
 * One thread of the browser analysis (see index.ts). It analyses the segments of a set it is given,
 * reading a WAV/AIFF file itself, decoding the packets the decoder worker hands it (MP3, FLAC) or
 * fed audio that worker decoded, and runs takeover detection off the page's thread.
 */
import { unpackSpectrum, type SegmentAnalysis } from '@shared/analysis'
import { analyseSegment, createSegmentPipeline } from '@shared/analyseSource'
import { pcmSource } from '@shared/pcm'
import { detectTakeovers } from '@shared/takeover'
import type { FeedMessage, FeedReply, WorkerJob, WorkerReply } from './protocol'

type DecodeMessage = Extract<FeedMessage, { type: 'decode' }>

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
      } else if (m.type === 'decode') {
        decodeSegment(m).then(
          (result) => {
            post({ type: 'segment', id: m.id, result }, transfers(result))
            port.postMessage({ type: 'free' } satisfies FeedReply)
          },
          (err) => post({ type: 'error', id: m.id, message: message(err) })
        )
      }
    } catch (err) {
      post({ type: 'error', id: m.id, message: message(err) })
    }
  }
}

const SIDE = Math.fround(Math.SQRT1_2)

/**
 * Decodes a segment's packets and analyses it. Positions count decoded samples from the first
 * one's timestamp, as decode.ts does for a whole file, so they're the same as in one piece.
 */
async function decodeSegment(m: DecodeMessage): Promise<SegmentAnalysis> {
  const d = m.decoding
  const sr = d.sampleRate
  const pipeline = createSegmentPipeline(sr, m.range, { spectrum: true })
  // Where this segment's audio ends: its input's end, or the end of the set.
  const stop = Math.min(pipeline.end, d.limit ?? Infinity)
  let pos: number | null = null
  let failed: unknown = null
  let reported = 0
  let left = new Float32Array(0)
  let right = new Float32Array(0)
  let mono = new Float32Array(0)
  const decoder = new AudioDecoder({
    output: (a) => {
      try {
        if (failed) return
        if (a.sampleRate !== sr) throw new Error(`The decoder gave ${a.sampleRate} Hz audio, not ${sr} Hz`)
        if (pos === null) pos = Math.round((a.timestamp * sr) / 1e6) - d.skip
        const n = a.numberOfFrames
        // The part of it this segment still needs: from where its input has got to, up to `stop`.
        const from = Math.max(0, pipeline.start + pipeline.pushed - pos)
        const to = Math.min(n, stop - pos)
        if (to > from) {
          const k = to - from
          if (mono.length < k) {
            left = new Float32Array(Math.max(k, 4096))
            right = new Float32Array(left.length)
            mono = new Float32Array(left.length)
          }
          a.copyTo(left, { planeIndex: 0, format: 'f32-planar', frameOffset: from, frameCount: k })
          if (a.numberOfChannels === 1) mono.set(left.subarray(0, k))
          else {
            // ffmpeg's stereo downmix, as in decode.ts.
            a.copyTo(right, { planeIndex: 1, format: 'f32-planar', frameOffset: from, frameCount: k })
            const f = Math.fround
            for (let i = 0; i < k; i++) mono[i] = f(f(left[i] * SIDE) + f(right[i] * SIDE))
          }
          pipeline.push(mono.subarray(0, k), pos + from)
          const seconds = (pos + to) / sr - m.range.from
          if (seconds - reported >= 0.5) {
            reported = seconds
            post({ type: 'progress', id: m.id, seconds })
          }
        }
        pos += n
      } catch (e) {
        failed ??= e
      } finally {
        a.close()
      }
    },
    error: (e) => {
      failed ??= e
    }
  })
  try {
    decoder.configure(d.config)
    for (let i = 0; i < m.timestamps.length; i++)
      decoder.decode(new EncodedAudioChunk({ type: 'key', timestamp: m.timestamps[i], duration: m.durations[i], data: m.data.subarray(m.offsets[i], m.offsets[i + 1]) }))
    await decoder.flush()
  } catch (e) {
    failed ??= e
  } finally {
    if (decoder.state !== 'closed') decoder.close()
  }
  if (failed) throw failed
  return pipeline.finish(m.atEnd)
}
