/**
 * Compressed recordings (MP3, FLAC, AAC/M4A, Ogg/Opus/Vorbis, WebM...) decoded in the browser:
 * Mediabunny reads the container and the browser's WebCodecs AudioDecoder decodes it. The audio
 * comes out downmixed to mono at exact frame positions from 0, trimmed at both ends the way ffmpeg
 * trims it for the desktop app (encoder delay and padding), so both analyse the same samples.
 */
import { ALL_FORMATS, AudioSampleSink, BlobSource, Input, OggInputFormat, UnsupportedInputFormatError } from 'mediabunny'
import { mp3Gapless } from '@shared/mp3'

export interface CompressedInfo {
  codec: string
  sampleRate: number
  channels: number
  /** From the file's metadata (what ffprobe reports for the desktop app); null when it has none. */
  duration: number | null
}

/** Mono samples of the set, `at` being the set's frame index of the first one. */
export interface MonoChunk {
  at: number
  samples: Float32Array
}

/** Why a file can't be decoded here: `codec` names the codec this browser has no decoder for. */
export class DecodeError extends Error {
  constructor(
    readonly reason: 'format' | 'noAudio' | 'codec',
    readonly codec?: string
  ) {
    super(reason === 'codec' ? `This browser can't decode ${codec} audio` : reason === 'noAudio' ? 'The file has no audio' : 'Not an audio file this app can read')
  }
}

/** The start of an MP3 after its ID3v2 tags (cover art can make those long), for mp3Gapless. */
async function mp3Head(file: Blob) {
  let o = 0
  for (;;) {
    const h = new Uint8Array(await file.slice(o, o + 10).arrayBuffer())
    if (h.length < 10 || h[0] !== 0x49 || h[1] !== 0x44 || h[2] !== 0x33) break
    o += 10 + (((h[6] & 0x7f) << 21) | ((h[7] & 0x7f) << 14) | ((h[8] & 0x7f) << 7) | (h[9] & 0x7f)) + (h[5] & 0x10 ? 10 : 0)
  }
  return new Uint8Array(await file.slice(o, o + 65536).arrayBuffer())
}

/** Samples per chunk handed on (about a second): decoders give a few hundred at a time. */
const CHUNK = 1 << 15

const SIDE = Math.fround(Math.SQRT1_2)

export async function openCompressed(file: Blob) {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
  let track
  try {
    track = await input.getPrimaryAudioTrack()
  } catch (e) {
    input.dispose()
    if (e instanceof UnsupportedInputFormatError) throw new DecodeError('format')
    throw e
  }
  if (!track) {
    input.dispose()
    throw new DecodeError('noAudio')
  }
  const codec = track.codec ?? 'unknown'
  if (!(await track.canDecode())) {
    input.dispose()
    throw new DecodeError('codec', codec)
  }
  const gapless = codec === 'mp3' ? mp3Gapless(await mp3Head(file)) : null
  // Ogg's last page says where the audio ends, inside the last packet the decoder gives whole; ffmpeg
  // trims there. (Finding it is cheap for Ogg; for MP3 or FLAC it would mean reading the whole file.)
  const oggEnd = (await input.getFormat()) instanceof OggInputFormat ? await track.computeDuration().catch(() => null) : null
  const info: CompressedInfo = {
    codec,
    sampleRate: track.sampleRate,
    channels: track.numberOfChannels,
    duration: (await track.getDurationFromMetadata().catch(() => null)) ?? oggEnd
  }

  /**
   * Decodes the whole file in order. Positions count decoded samples (as ffmpeg does): the first
   * packet's timestamp only says how many samples at the start are priming to drop.
   */
  async function* mono(signal?: AbortSignal): AsyncGenerator<MonoChunk & { sampleRate: number }> {
    const sink = new AudioSampleSink(track!)
    const skip = gapless?.skip ?? 0
    let limit = gapless?.length ?? Infinity
    let pos: number | null = null
    let sampleRate = 0
    let buf = new Float32Array(CHUNK)
    let fill = 0
    let bufAt = 0
    const planes: Float32Array[] = []
    try {
      for await (const s of sink.samples()) {
        try {
          signal?.throwIfAborted()
          if (pos === null) {
            sampleRate = s.sampleRate
            pos = Math.round(s.timestamp * sampleRate) - skip
            if (oggEnd !== null) limit = Math.round(oggEnd * sampleRate)
          }
          const n = s.numberOfFrames
          // The part of this sample inside [0, limit).
          const from = Math.max(0, -pos)
          const to = Math.min(n, limit - pos)
          let i = from
          while (i < to) {
            if (fill === 0) bufAt = pos + i
            const take = Math.min(to - i, CHUNK - fill)
            const ch = s.numberOfChannels
            for (let c = 0; c < Math.min(ch, 2); c++) {
              if (!planes[c] || planes[c].length < take) planes[c] = new Float32Array(Math.max(take, 4096))
              s.copyTo(planes[c], { planeIndex: c, format: 'f32-planar', frameOffset: i, frameCount: take })
            }
            if (ch === 1) buf.set(planes[0].subarray(0, take), fill)
            else {
              // ffmpeg's stereo downmix, as in downmix() (src/shared/analyseSource.ts).
              const l = planes[0]
              const r = planes[1]
              const f = Math.fround
              for (let k = 0; k < take; k++) buf[fill + k] = f(f(l[k] * SIDE) + f(r[k] * SIDE))
            }
            fill += take
            i += take
            if (fill === CHUNK) {
              yield { at: bufAt, samples: buf, sampleRate }
              buf = new Float32Array(CHUNK)
              fill = 0
            }
          }
          pos += n
        } finally {
          s.close()
        }
      }
      if (fill) yield { at: bufAt, samples: buf.subarray(0, fill), sampleRate }
    } finally {
      input.dispose()
    }
  }

  return { info, mono, dispose: () => input.dispose() }
}
