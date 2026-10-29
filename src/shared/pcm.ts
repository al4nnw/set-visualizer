/**
 * Uncompressed audio files (WAV, RF64/BW64, AIFF, AIFF-C) read straight from a Blob, a slice at a
 * time: what Rekordbox records sets as. Works wherever Blob does (browsers, workers, Node 20+), so
 * a 2-hour WAV is never loaded whole.
 */
import type { AudioSource } from './audioSource'

type Encoding = 'u8' | 's16le' | 's24le' | 's32le' | 'f32le' | 'f64le' | 's16be' | 's24be' | 's32be' | 'f32be' | 'f64be'

export interface PcmLayout {
  container: 'wav' | 'aiff'
  sampleRate: number
  channels: number
  encoding: Encoding
  bytesPerSample: number
  /** Byte offset of the first sample frame. */
  dataOffset: number
  frames: number
}

const BYTES: Record<Encoding, number> = { u8: 1, s16le: 2, s24le: 3, s32le: 4, f32le: 4, f64le: 8, s16be: 2, s24be: 3, s32be: 4, f32be: 4, f64be: 8 }

const tag = (v: DataView, o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3))

/** IEEE 754 80-bit extended float (AIFF's sample rate). */
function extended80(v: DataView, o: number) {
  const exp = v.getUint16(o) & 0x7fff
  const sign = v.getUint16(o) & 0x8000 ? -1 : 1
  const hi = v.getUint32(o + 2)
  const lo = v.getUint32(o + 6)
  if (exp === 0 && hi === 0 && lo === 0) return 0
  return sign * (hi * 2 ** (exp - 16383 - 31) + lo * 2 ** (exp - 16383 - 63))
}

/** How many header bytes to look at for the chunks before the samples (metadata can be long). */
const HEAD_BYTES = 1 << 20

/** Reads the header of a WAV or AIFF file; null when the blob isn't one we can read this way. */
export async function probePcm(blob: Blob): Promise<PcmLayout | null> {
  const head = new DataView(await blob.slice(0, Math.min(blob.size, HEAD_BYTES)).arrayBuffer())
  if (head.byteLength < 12) return null
  const id = tag(head, 0)
  if ((id === 'RIFF' || id === 'RF64' || id === 'BW64') && tag(head, 8) === 'WAVE') return parseWav(head, blob.size, id !== 'RIFF')
  if (id === 'FORM' && (tag(head, 8) === 'AIFF' || tag(head, 8) === 'AIFC')) return parseAiff(head, blob.size, tag(head, 8) === 'AIFC')
  return null
}

function parseWav(v: DataView, size: number, rf64: boolean): PcmLayout | null {
  let o = 12
  let fmt: { tagId: number; channels: number; rate: number; bits: number; align: number } | null = null
  let dataSize64: number | null = null
  while (o + 8 <= v.byteLength) {
    const id = tag(v, o)
    const len = v.getUint32(o + 4, true)
    const body = o + 8
    if (id === 'ds64' && body + 16 <= v.byteLength) {
      // RF64: the real data size, as a 64-bit number after the RIFF size.
      dataSize64 = v.getUint32(body + 8, true) + v.getUint32(body + 12, true) * 2 ** 32
    } else if (id === 'fmt ' && body + 16 <= v.byteLength) {
      let tagId = v.getUint16(body, true)
      const channels = v.getUint16(body + 2, true)
      const rate = v.getUint32(body + 4, true)
      const align = v.getUint16(body + 12, true)
      const bits = v.getUint16(body + 14, true)
      // WAVE_FORMAT_EXTENSIBLE: the real format is the first two bytes of the sub-format GUID.
      if (tagId === 0xfffe && len >= 40 && body + 26 <= v.byteLength) tagId = v.getUint16(body + 24, true)
      fmt = { tagId, channels, rate, bits, align }
    } else if (id === 'data') {
      if (!fmt || !fmt.channels || !fmt.rate) return null
      const enc: Encoding | null =
        fmt.tagId === 1 ? ({ 8: 'u8', 16: 's16le', 24: 's24le', 32: 's32le' } as Record<number, Encoding>)[fmt.bits] ?? null : fmt.tagId === 3 ? ({ 32: 'f32le', 64: 'f64le' } as Record<number, Encoding>)[fmt.bits] ?? null : null
      if (!enc) return null
      const bps = BYTES[enc]
      const frameBytes = fmt.align || bps * fmt.channels
      if (frameBytes !== bps * fmt.channels) return null
      // Recorders that were stopped early, or wrote 0 / 0xFFFFFFFF, leave the size wrong: trust the file.
      const declared = rf64 && len === 0xffffffff && dataSize64 !== null ? dataSize64 : len
      const available = size - body
      const bytes = declared > 0 && declared !== 0xffffffff && declared <= available ? declared : available
      return { container: 'wav', sampleRate: fmt.rate, channels: fmt.channels, encoding: enc, bytesPerSample: bps, dataOffset: body, frames: Math.floor(bytes / frameBytes) }
    }
    o = body + len + (len % 2)
  }
  return null
}

function parseAiff(v: DataView, size: number, aifc: boolean): PcmLayout | null {
  let o = 12
  let comm: { channels: number; frames: number; bits: number; rate: number; compression: string } | null = null
  while (o + 8 <= v.byteLength) {
    const id = tag(v, o)
    const len = v.getUint32(o + 4)
    const body = o + 8
    if (id === 'COMM' && body + 18 <= v.byteLength) {
      comm = {
        channels: v.getUint16(body),
        frames: v.getUint32(body + 2),
        bits: v.getUint16(body + 6),
        rate: extended80(v, body + 8),
        compression: aifc && body + 22 <= v.byteLength ? tag(v, body + 18) : 'NONE'
      }
    } else if (id === 'SSND') {
      if (!comm || !comm.channels || !comm.rate) return null
      const offset = v.getUint32(body)
      const c = comm.compression
      const byBits = (le: boolean) => ({ 8: 's8', 16: le ? 's16le' : 's16be', 24: le ? 's24le' : 's24be', 32: le ? 's32le' : 's32be' })[comm!.bits]
      const enc = (c === 'NONE' || c === 'twos' ? byBits(false) : c === 'sowt' ? byBits(true) : c === 'fl32' || c === 'FL32' ? 'f32be' : c === 'fl64' || c === 'FL64' ? 'f64be' : c === 'in24' ? 's24be' : c === 'in32' ? 's32be' : c === '42ni' ? 's32le' : undefined) as
        | Encoding
        | 's8'
        | undefined
      if (!enc || enc === 's8') return null
      const bps = BYTES[enc]
      const dataOffset = body + 8 + offset
      const frames = Math.min(comm.frames, Math.floor((size - dataOffset) / (bps * comm.channels)))
      return { container: 'aiff', sampleRate: Math.round(comm.rate), channels: comm.channels, encoding: enc, bytesPerSample: bps, dataOffset, frames }
    }
    o = body + len + (len % 2)
  }
  return null
}

/** Frames read per slice of the file (about 1.5 MB of 16-bit stereo). */
const CHUNK_FRAMES = 1 << 18

/** Converts interleaved samples to one float array per channel, scaled to [-1, 1). */
function deinterleave(buf: ArrayBuffer, l: PcmLayout, frames: number): Float32Array[] {
  const ch = l.channels
  const out = Array.from({ length: ch }, () => new Float32Array(frames))
  const v = new DataView(buf)
  switch (l.encoding) {
    case 's16le': {
      const a = new Int16Array(buf, 0, frames * ch)
      for (let c = 0; c < ch; c++) {
        const o = out[c]
        for (let i = 0, j = c; i < frames; i++, j += ch) o[i] = a[j] / 32768
      }
      break
    }
    case 'f32le': {
      const a = new Float32Array(buf, 0, frames * ch)
      for (let c = 0; c < ch; c++) {
        const o = out[c]
        for (let i = 0, j = c; i < frames; i++, j += ch) o[i] = a[j]
      }
      break
    }
    case 's32le': {
      const a = new Int32Array(buf, 0, frames * ch)
      for (let c = 0; c < ch; c++) {
        const o = out[c]
        for (let i = 0, j = c; i < frames; i++, j += ch) o[i] = a[j] / 2147483648
      }
      break
    }
    case 's24le': {
      const b = new Uint8Array(buf)
      for (let c = 0; c < ch; c++) {
        const o = out[c]
        for (let i = 0, p = c * 3; i < frames; i++, p += ch * 3) o[i] = ((b[p] | (b[p + 1] << 8) | (b[p + 2] << 16)) << 8) / 2147483648
      }
      break
    }
    case 'u8': {
      const b = new Uint8Array(buf)
      for (let c = 0; c < ch; c++) {
        const o = out[c]
        for (let i = 0, j = c; i < frames; i++, j += ch) o[i] = (b[j] - 128) / 128
      }
      break
    }
    default: {
      // Big-endian and 64-bit formats: rare enough for DataView.
      const bps = l.bytesPerSample
      const read: (p: number) => number =
        l.encoding === 's16be'
          ? (p) => v.getInt16(p) / 32768
          : l.encoding === 's24be'
            ? (p) => ((v.getUint8(p) << 24) | (v.getUint8(p + 1) << 16) | (v.getUint8(p + 2) << 8)) / 2147483648
            : l.encoding === 's32be'
              ? (p) => v.getInt32(p) / 2147483648
              : l.encoding === 'f32be'
                ? (p) => v.getFloat32(p)
                : l.encoding === 'f64be'
                  ? (p) => v.getFloat64(p)
                  : (p) => v.getFloat64(p, true)
      for (let c = 0; c < ch; c++) {
        const o = out[c]
        for (let i = 0, p = c * bps; i < frames; i++, p += ch * bps) o[i] = read(p)
      }
    }
  }
  return out
}

/** An uncompressed file as an AudioSource: exact frame positions, any range read directly. */
export function pcmSource(blob: Blob, l: PcmLayout): AudioSource {
  const frameBytes = l.bytesPerSample * l.channels
  return {
    kind: l.container,
    sampleRate: l.sampleRate,
    channels: l.channels,
    frames: l.frames,
    duration: l.frames / l.sampleRate,
    async read(from, to, onChunk, signal) {
      const end = Math.min(to, l.frames)
      // Read one slice ahead so the disk and the caller's work overlap.
      let next: Promise<ArrayBuffer> | null = null
      const slice = (at: number) => {
        const n = Math.min(CHUNK_FRAMES, end - at)
        return blob.slice(l.dataOffset + at * frameBytes, l.dataOffset + (at + n) * frameBytes).arrayBuffer()
      }
      for (let at = Math.max(0, from); at < end; ) {
        signal?.throwIfAborted()
        const n = Math.min(CHUNK_FRAMES, end - at)
        const buf = await (next ?? slice(at))
        next = at + n < end ? slice(at + n) : null
        const frames = Math.floor(buf.byteLength / frameBytes)
        if (!frames) break
        await onChunk(deinterleave(buf, l, frames), at)
        at += frames
      }
    }
  }
}
