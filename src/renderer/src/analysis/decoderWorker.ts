/// <reference lib="webworker" />
/**
 * Reads a compressed recording from start to end (its packets can only be found in order) and
 * hands each segment of it to a free segment worker. For MP3 and FLAC, which decode the same from
 * mid-file, it hands over the segment's packets and every worker decodes its own; for the other
 * codecs it decodes here, so one thread decodes while the others analyse.
 */
import type { SegmentRange } from '@shared/analysis'
import { segmentInput } from '@shared/analyseSource'
import { DecodeError, openCompressed, type Packet, type PacketDecoding } from './decode'
import type { DecoderJob, DecoderReply, FeedMessage } from './protocol'

const post = (m: DecoderReply) => postMessage(m)

let opened: Awaited<ReturnType<typeof openCompressed>> | null = null

self.onmessage = async (e: MessageEvent<DecoderJob>) => {
  const job = e.data
  try {
    if (job.type === 'open') {
      opened = await openCompressed(job.file)
      post({ type: 'info', info: opened.info })
    } else if (opened!.decoding && !job.inOrder) {
      await runPackets(job.ports, job.segmentLength, opened!.decoding)
    } else {
      await run(job.ports, job.segmentLength)
    }
  } catch (err) {
    const d = err instanceof DecodeError ? err : null
    post({ type: 'error', reason: d?.reason, codec: d?.codec, message: String((err as Error)?.message ?? err) })
  }
}

/** The workers behind `ports`, as they become free for another segment. */
function workerPool(ports: MessagePort[]) {
  const free = [...ports]
  let wake: (() => void) | null = null
  for (const port of ports)
    port.onmessage = () => {
      free.push(port)
      wake?.()
    }
  return {
    free,
    /** Resolves when a worker reports it's free again. */
    freed: () => new Promise<void>((r) => (wake = r)),
    get busy() {
      return ports.length - free.length
    }
  }
}

/**
 * Hands each segment's packets to a free worker, with enough packets before them to warm its
 * decoder up (decode.ts, MIDSTREAM). Reading packets is quick next to decoding them, so every
 * worker decodes and this thread stays a step ahead of them.
 */
async function runPackets(ports: MessagePort[], length: number, decoding: PacketDecoding) {
  const pool = workerPool(ports)
  const sr = decoding.sampleRate
  const rangeOf = (k: number): SegmentRange => ({ from: k * length, to: (k + 1) * length })
  let k = 0
  let need = segmentInput(sr, rangeOf(0))
  // Packets the next segments may need: their input, and the warm-up before it.
  let held: Packet[] = []
  /** Where the packets segment `need` decodes start: its first input packet, less the warm-up. */
  const firstFor = (start: number) => {
    let a = 0
    while (a < held.length && held[a].at + held[a].frames <= start) a++
    let w = a
    for (let bytes = 0; w > 0 && (a - w < decoding.warmUp.packets || bytes < decoding.warmUp.bytes); ) bytes += held[--w].data.length
    return w
  }
  const give = async (atEnd: boolean) => {
    const first = firstFor(need.start)
    let end = first
    while (end < held.length && held[end].at < need.end) end++
    const list = held.slice(first, end)
    const data = new Uint8Array(list.reduce((n, p) => n + p.data.length, 0))
    const offsets = new Uint32Array(list.length + 1)
    const timestamps = new Float64Array(list.length)
    const durations = new Float64Array(list.length)
    list.forEach((p, i) => {
      data.set(p.data, offsets[i])
      offsets[i + 1] = offsets[i] + p.data.length
      timestamps[i] = p.timestamp
      durations[i] = p.duration
    })
    while (!pool.free.length) await pool.freed()
    const range = rangeOf(k)
    post({ type: 'segment', id: k, range })
    const m: FeedMessage = { type: 'decode', id: k, range, decoding, atEnd, data, offsets, timestamps, durations }
    pool.free.shift()!.postMessage(m, [data.buffer, offsets.buffer, timestamps.buffer, durations.buffer])
    k++
    need = segmentInput(sr, rangeOf(k))
    held = held.slice(firstFor(need.start))
  }
  // Where the set ends: the last packet's end, or before it where the file says the audio stops.
  let last = 0
  for await (const p of opened!.packets()) {
    // Segments whose input ends before this packet have all their packets.
    while (need.end <= p.at) await give(false)
    held.push(p)
    last = Math.min(p.at + p.frames, decoding.limit ?? Infinity)
  }
  // The segments left end with the file: each one whose input starts before its end (at least one).
  do await give(true)
  while (need.start < last)
  while (pool.busy) await pool.freed()
  post({ type: 'decoded', frames: last, sampleRate: sr, segments: k })
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
  const { free, freed } = workerPool(ports)

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
