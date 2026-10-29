/// <reference lib="webworker" />
/**
 * Decodes a compressed recording from start to end (decoders can't start just anywhere in an MP3 or
 * FLAC file without reading everything before it) and hands each segment of it to a free segment
 * worker, so the analysis runs on several threads while one decodes.
 */
import type { SegmentRange } from '@shared/analysis'
import { segmentInput } from '@shared/analyseSource'
import { DecodeError, openCompressed } from './decode'
import type { DecoderJob, DecoderReply, FeedMessage } from './protocol'

const post = (m: DecoderReply) => postMessage(m)

let opened: Awaited<ReturnType<typeof openCompressed>> | null = null

self.onmessage = async (e: MessageEvent<DecoderJob>) => {
  const job = e.data
  try {
    if (job.type === 'open') {
      opened = await openCompressed(job.file)
      post({ type: 'info', info: opened.info })
    } else {
      await run(job.ports, job.segmentLength)
    }
  } catch (err) {
    const d = err instanceof DecodeError ? err : null
    post({ type: 'error', reason: d?.reason, codec: d?.codec, message: String((err as Error)?.message ?? err) })
  }
}

interface Seg {
  id: number
  range: SegmentRange
  start: number
  end: number
  port: MessagePort | null
  /** What it was sent before a worker was free to take it. */
  queue: FeedMessage[]
  ended: boolean
}

async function run(ports: MessagePort[], length: number) {
  const free = [...ports]
  let wake: (() => void) | null = null
  for (const port of ports)
    port.onmessage = () => {
      free.push(port)
      wake?.()
    }
  const freed = () => new Promise<void>((r) => (wake = r))

  const segs: Seg[] = []
  const send = (s: Seg, m: FeedMessage) => {
    if (!s.port) s.queue.push(m)
    else s.port.postMessage(m, m.type === 'chunk' ? [m.samples.buffer] : [])
  }
  /** Gives waiting segments to free workers, and forgets the ones fully handed over. */
  const assign = () => {
    for (const s of segs) {
      if (s.port || !free.length) continue
      s.port = free.shift()!
      s.port.postMessage({ type: 'begin', id: s.id, range: s.range, sampleRate } satisfies FeedMessage)
      for (const m of s.queue) send(s, m)
      s.queue = []
    }
    for (let i = segs.length - 1; i >= 0; i--) if (segs[i].port && segs[i].ended) segs.splice(i, 1)
  }

  const rangeOf = (k: number): SegmentRange => ({ from: k * length, to: (k + 1) * length })
  let sampleRate = 0
  let next = 0
  let nextStart = 0
  let frames = 0
  for await (const c of opened!.mono()) {
    if (!sampleRate) sampleRate = c.sampleRate
    const chunkEnd = c.at + c.samples.length
    // Segments whose input (with its warm-up) starts in this chunk.
    while (nextStart < chunkEnd) {
      const range = rangeOf(next)
      const { start, end } = segmentInput(sampleRate, range)
      segs.push({ id: next, range, start, end, port: null, queue: [], ended: false })
      post({ type: 'segment', id: next, range })
      next++
      nextStart = segmentInput(sampleRate, rangeOf(next)).start
    }
    for (const s of segs) {
      const from = Math.max(s.start, c.at)
      const to = Math.min(s.end, chunkEnd)
      if (to > from) send(s, { type: 'chunk', id: s.id, at: from, samples: c.samples.slice(from - c.at, to - c.at) })
      if (!s.ended && s.end <= chunkEnd) {
        s.ended = true
        send(s, { type: 'end', id: s.id, atEnd: false })
      }
    }
    assign()
    // Don't decode further ahead while a segment that has all its audio waits for a worker.
    while (segs.some((s) => s.ended && !s.port)) {
      await freed()
      assign()
    }
    frames = chunkEnd
  }
  for (const s of segs)
    if (!s.ended) {
      s.ended = true
      send(s, { type: 'end', id: s.id, atEnd: true })
    }
  while (segs.length) {
    if (!free.length) await freed()
    assign()
  }
  post({ type: 'decoded', frames, sampleRate, segments: next })
}
