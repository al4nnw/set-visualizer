/**
 * Gapless MP3: the encoder's delay and padding from the LAME/Info header of the first frame, read
 * the way ffmpeg reads it (libavformat/mp3dec.c), so the browser trims a decoded MP3 exactly as the
 * ffmpeg does and the waveform lines up with what the audio element plays.
 */

const BITRATES_V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
const BITRATES_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
const RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] } as Record<number, number[]>

/** The decoder's own delay, which ffmpeg adds to the encoder's (528 + 1). */
const DECODER_DELAY = 529

interface FrameHeader {
  /** MPEG-2 or 2.5 (half the samples per frame). */
  lsf: boolean
  mono: boolean
  sampleRate: number
  size: number
  samplesPerFrame: number
}

/** A Layer III frame header at `o`, or null. */
function frameHeader(b: Uint8Array, o: number): FrameHeader | null {
  if (o + 4 > b.length || b[o] !== 0xff || (b[o + 1] & 0xe0) !== 0xe0) return null
  const version = (b[o + 1] >> 3) & 3
  const layer = (b[o + 1] >> 1) & 3
  const bitrateIndex = b[o + 2] >> 4
  const rateIndex = (b[o + 2] >> 2) & 3
  if (version === 1 || layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) return null
  const lsf = version !== 3
  const sampleRate = RATES[version][rateIndex]
  const bitrate = (lsf ? BITRATES_V2 : BITRATES_V1)[bitrateIndex] * 1000
  const padding = (b[o + 2] >> 1) & 1
  return {
    lsf,
    mono: b[o + 3] >> 6 === 3,
    sampleRate,
    size: Math.floor(((lsf ? 72 : 144) * bitrate) / sampleRate) + padding,
    samplesPerFrame: lsf ? 576 : 1152
  }
}

export interface Mp3Gapless {
  sampleRate: number
  /** Decoded samples to drop at the start (the encoder's delay plus the decoder's). */
  skip: number
  /** Samples left after trimming both ends, when the header has a frame count. */
  length: number | null
}

/**
 * Reads the gapless info from the start of an MP3 file (the first few KB after any ID3v2 tag are
 * enough). Null when it isn't an MP3 or has no LAME/Info header (ffmpeg trims nothing then either).
 */
export function mp3Gapless(b: Uint8Array): Mp3Gapless | null {
  let o = 0
  // ID3v2 tags (there can be several).
  while (o + 10 <= b.length && b[o] === 0x49 && b[o + 1] === 0x44 && b[o + 2] === 0x33) {
    const size = ((b[o + 6] & 0x7f) << 21) | ((b[o + 7] & 0x7f) << 14) | ((b[o + 8] & 0x7f) << 7) | (b[o + 9] & 0x7f)
    o += 10 + size + (b[o + 5] & 0x10 ? 10 : 0)
  }
  // The first frame: a header whose next frame starts with a header too (junk can come first).
  let h: FrameHeader | null = null
  for (const end = Math.min(b.length - 4, o + 65536); o < end; o++) {
    h = frameHeader(b, o)
    if (h && (o + h.size + 4 > b.length || frameHeader(b, o + h.size))) break
    h = null
  }
  if (!h) return null
  // The Xing/Info tag sits after the side information.
  let p = o + 4 + (h.lsf ? (h.mono ? 9 : 17) : h.mono ? 17 : 32)
  if (p + 8 > b.length) return null
  const id = String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3])
  if (id !== 'Xing' && id !== 'Info') return null
  const u32 = (q: number) => ((b[q] << 24) | (b[q + 1] << 16) | (b[q + 2] << 8) | b[q + 3]) >>> 0
  const flags = u32(p + 4)
  p += 8
  let frames = 0
  if (flags & 1) {
    frames = u32(p)
    p += 4
  }
  if (flags & 2) p += 4 // file size
  if (flags & 4) p += 100 // seek table
  if (flags & 8) p += 4 // VBR quality
  // Encoder version (9), revision + VBR method, lowpass, peak (4), two replay gains (2 + 2),
  // flags + ATH type, bitrate: then the delays, 12 bits each.
  if (p + 24 > b.length) return null
  const encoder = String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3])
  if (encoder !== 'LAME' && encoder !== 'Lavf' && encoder !== 'Lavc') return null
  const d = p + 21
  const startPad = (b[d] << 4) | (b[d + 1] >> 4)
  const endPad = ((b[d + 1] & 0x0f) << 8) | b[d + 2]
  return {
    sampleRate: h.sampleRate,
    skip: startPad + DECODER_DELAY,
    length: frames ? Math.max(0, frames * h.samplesPerFrame - startPad - endPad) : null
  }
}
