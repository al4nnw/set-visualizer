import { describe, expect, it } from 'vitest'
import { ANALYSIS_STREAMS, mergeSegments, packSpectrum, SPECTRUM_BANDS, SPECTRUM_POWER_BANDS, unpackSpectrum } from '../src/shared/analysis'
import { analyseSegment, createSegmentPipeline, downmix, planSegments, segmentInput } from '../src/shared/analyseSource'
import type { AudioSource } from '../src/shared/audioSource'
import { biquadFor, designResampler, FilterChain, jsKernel, Resampler, wasmKernel } from '../src/shared/dsp'
import { RESAMPLE_WASM } from '../src/shared/resampleWasm'
import { compileWat } from '../scripts/build-wasm'
import { mp3Gapless } from '../src/shared/mp3'
import { pcmSource, probePcm } from '../src/shared/pcm'

/** Repeatable noise in [-1, 1). */
function noise(n: number, seed = 1) {
  const out = new Float32Array(n)
  let s = seed
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    out[i] = s / 2 ** 31 - 1
  }
  return out
}

function concat(parts: Float32Array[]) {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

/** Everything a resampler gives for `x` pushed in pieces of `chunk`. */
function resampleAll(r: Resampler, x: Float32Array, chunk: number) {
  const out: Float32Array[] = []
  for (let i = 0; i < x.length; i += chunk) out.push(r.push(x.subarray(i, i + chunk)))
  out.push(r.flush())
  return concat(out)
}

describe('browser analysis filters and resampler', () => {
  it('designs ffmpeg-style lowpass and highpass biquads', () => {
    const lp = biquadFor({ type: 'lowpass', f: 140 }, 11025)
    expect((lp.b0 + lp.b1 + lp.b2) / (1 + lp.a1 + lp.a2)).toBeCloseTo(1, 10)
    const hp = biquadFor({ type: 'highpass', f: 250 }, 11025)
    expect(hp.b0 + hp.b1 + hp.b2).toBeCloseTo(0, 10)
    // Unity gain at Nyquist (z = -1).
    expect((hp.b0 - hp.b1 + hp.b2) / (1 - hp.a1 + hp.a2)).toBeCloseTo(1, 10)
  })

  it('filters a stream the same in any chunking', () => {
    const x = noise(50000)
    const whole = x.slice()
    new FilterChain(ANALYSIS_STREAMS.vocal.filters, 11025).process(whole)
    const pieces = x.slice()
    const chain = new FilterChain(ANALYSIS_STREAMS.vocal.filters, 11025)
    for (let i = 0; i < pieces.length; i += 777) chain.process(pieces.subarray(i, i + 777))
    expect(pieces).toEqual(whole)
  })

  it.each([
    [44100, 11025],
    [48000, 11025],
    [96000, 11025],
    [11025, 2000],
    [11025, 8000]
  ])('resamples %i Hz to %i Hz the same in any chunking', (inRate, outRate) => {
    const x = noise(inRate * 2 + 123)
    const whole = resampleAll(new Resampler(inRate, outRate), x, x.length)
    // One output per output period that starts inside the input, as libswresample gives.
    expect(whole.length).toBe(Math.ceil((x.length * outRate) / inRate))
    expect(resampleAll(new Resampler(inRate, outRate), x, 4096)).toEqual(whole)
    expect(resampleAll(new Resampler(inRate, outRate), x, 7)).toEqual(whole)
  })

  it('lines a resampler started mid-stream up with one that had the whole stream', () => {
    const x = noise(44100 * 3)
    const whole = resampleAll(new Resampler(44100, 11025), x, 4096)
    const late = new Resampler(44100, 11025, { inputStart: 40000, outputStart: 10500 })
    expect(resampleAll(late, x.subarray(40000), 4096)).toEqual(whole.subarray(10500))

    const y = noise(11025 * 5, 7)
    const band = resampleAll(new Resampler(11025, 2000), y, 4096)
    const lateBand = new Resampler(11025, 2000, { inputStart: 22050, outputStart: 6000 })
    expect(resampleAll(lateBand, y.subarray(22050), 1000)).toEqual(band.subarray(6000))

    // The first output wanted needs input from before the first sample given.
    expect(() => new Resampler(44100, 11025, { inputStart: 42000, outputStart: 10500 })).toThrow()
  })

  it.each([
    [44100, 11025],
    [48000, 11025],
    [96000, 11025],
    [44056, 11025],
    [11025, 2000],
    [11025, 8000],
    [8000, 11025]
  ])('computes %i Hz to %i Hz in WebAssembly exactly as in JavaScript', (inRate, outRate) => {
    expect(wasmKernel).not.toBeNull()
    const x = noise(inRate * 3, inRate)
    const viaJs = resampleAll(new Resampler(inRate, outRate, { kernel: jsKernel }), x, 5000)
    const viaWasm = resampleAll(new Resampler(inRate, outRate, { kernel: wasmKernel! }), x, 5000)
    expect(viaWasm).toEqual(viaJs)
    // One call over most of the input (the memory grows for it), and an odd starting phase.
    const f = designResampler(inRate, outRate)
    const count = Math.floor(((x.length - f.taps - 2) * f.up) / f.down)
    const a = new Float32Array(count)
    const b = new Float32Array(count)
    jsKernel(f, x, 1, f.up - 1, count, a, 0)
    wasmKernel!(f, x, 1, f.up - 1, count, b, 0)
    expect(b).toEqual(a)
  })

  it('embeds the WebAssembly compiled from resample.wat', async () => {
    const bytes = await compileWat(new URL('../src/shared/resample.wat', import.meta.url).pathname)
    expect(Buffer.from(bytes).toString('base64'), 'run npm run build:wasm').toBe(RESAMPLE_WASM)
  })

  it('mirrors the input past both ends of the file, like libswresample', () => {
    const x = noise(1001)
    const f = designResampler(44100, 11025)
    const n = x.length
    // x[-k] = x[k] before the start, x[n + k] = x[n - 1 - k] after the end.
    const at = (i: number) => x[i < 0 ? -i : i >= n ? 2 * n - 1 - i : i]
    const expected = (j: number) => {
      const start = Math.floor((j * f.down) / f.up) - f.center
      const row = ((j * f.down) % f.up) * f.taps
      let acc = 0
      for (let i = 0; i < f.taps; i++) acc += f.table[row + i] * at(start + i)
      return acc
    }
    const out = resampleAll(new Resampler(44100, 11025), x, 100)
    expect(out).toHaveLength(251)
    for (const j of [0, 1, 20, 230, 249, 250]) expect(out[j]).toBeCloseTo(expected(j), 6)
  })
})

/** A source over samples in memory, handed over in pieces of `chunk` frames. */
function memorySource(planes: Float32Array[], sampleRate: number, chunk = 10000): AudioSource & { reads: [number, number][] } {
  const frames = planes[0].length
  const reads: [number, number][] = []
  return {
    kind: 'test',
    sampleRate,
    channels: planes.length,
    frames,
    duration: frames / sampleRate,
    reads,
    async read(from, to, onChunk) {
      reads.push([from, to])
      const end = Math.min(to, frames)
      for (let at = Math.max(0, from); at < end; at += chunk) {
        await onChunk(
          planes.map((p) => p.subarray(at, Math.min(at + chunk, end))),
          at
        )
      }
    }
  }
}

/** A minute and a bit of stereo: a bass tone and a vocal-range tone that come and go, over noise. */
function testSet(rate: number, seconds = 70) {
  const n = rate * seconds
  const hiss = noise(n, 3)
  const planes = [new Float32Array(n), new Float32Array(n)]
  for (let i = 0; i < n; i++) {
    const t = i / rate
    const bass = Math.sin(2 * Math.PI * 55 * t) * (Math.floor(t / 10) % 2 ? 0.6 : 0.1)
    const voice = Math.sin(2 * Math.PI * 880 * t) * (Math.floor(t / 7) % 2 ? 0.3 : 0)
    planes[0][i] = bass + voice + 0.02 * hiss[i]
    planes[1][i] = bass - voice + 0.02 * hiss[i]
  }
  return planes
}

describe('browser set analysis', () => {
  it('downmixes stereo the way ffmpeg does (each side at -3 dB)', () => {
    const m = downmix([Float32Array.of(1, 0.5, 0), Float32Array.of(-1, 0.5, 1)])
    expect(m[0]).toBe(0)
    expect(m[1]).toBeCloseTo(Math.SQRT1_2, 6)
    expect(m[2]).toBe(Math.fround(Math.SQRT1_2))
    const mono = Float32Array.of(0.25)
    expect(downmix([mono])).toBe(mono)
  })

  it('gives the same analysis for a set analysed in one piece or in segments', async () => {
    for (const rate of [44100, 48000]) {
      const src = memorySource(testSet(rate), rate)
      const whole = mergeSegments([await analyseSegment(src, { from: 0, to: null }, { spectrum: true })])
      const plan = planSegments(src.duration, 3)
      expect(plan).toEqual([
        { from: 0, to: 24 },
        { from: 24, to: 48 },
        { from: 48, to: null }
      ])
      // Segments merged in any order.
      const parts = await Promise.all([...plan].reverse().map((r) => analyseSegment(src, r, { spectrum: true })))
      const split = mergeSegments(parts)
      expect(whole.waveform.peaks).toHaveLength(70 * 50)
      expect(split.waveform).toEqual(whole.waveform)
      expect(split.spectrum!.frames.length).toBe(whole.spectrum!.frames.length)
      expect(split.spectrum!.frames.map((f) => [...f])).toEqual(whole.spectrum!.frames.map((f) => [...f]))
      // The power is normalised by set-wide totals, summed in another order.
      let worst = 0
      whole.spectrum!.power!.forEach((row, i) => row.forEach((v, b) => (worst = Math.max(worst, Math.abs(split.spectrum!.power![i][b] - v) / Math.max(1, v)))))
      expect(worst).toBeLessThan(1e-6)
    }
  })

  it('reads only the part of the file a segment needs', async () => {
    const src = memorySource(testSet(44100), 44100)
    await analyseSegment(src, { from: 24, to: 48 })
    const need = segmentInput(44100, { from: 24, to: 48 })
    expect(src.reads).toEqual([[need.start, need.end]])
    expect(need.start).toBeLessThan(23 * 44100)
    expect(need.end).toBeLessThan(49 * 44100)
  })

  it('does not depend on how the decoder chunks the audio', async () => {
    const planes = testSet(44100, 30)
    const a = await analyseSegment(memorySource(planes, 44100, 1152), { from: 0, to: null }, { spectrum: true })
    const b = await analyseSegment(memorySource(planes, 44100, 1 << 18), { from: 0, to: null }, { spectrum: true })
    expect(a).toEqual(b)
  })

  it('refuses audio with a gap in it', () => {
    const p = createSegmentPipeline(44100, { from: 0, to: null })
    p.push(new Float32Array(100), 0)
    expect(() => p.push(new Float32Array(100), 150)).toThrow(/skipped/)
  })

  it('splits a set into whole-second segments, the last one open-ended', () => {
    expect(planSegments(100, 4)).toEqual([
      { from: 0, to: 25 },
      { from: 25, to: 50 },
      { from: 50, to: 75 },
      { from: 75, to: null }
    ])
    // At least 20 s each.
    expect(planSegments(30, 8)).toEqual([{ from: 0, to: null }])
    expect(planSegments(0, 8)).toEqual([{ from: 0, to: null }])
    const long = planSegments(7280.4, 32)
    expect(long).toHaveLength(32)
    expect(long.every((r, i) => Number.isInteger(r.from) && (i === 31 ? r.to === null : r.to === long[i + 1].from))).toBe(true)
  })

  it('packs spectral frames into flat arrays and back', () => {
    const row = (n: number, seed: number) => noise(n, seed)
    const s = { fps: 4, frames: [row(SPECTRUM_BANDS, 1), row(SPECTRUM_BANDS, 2)], power: [row(SPECTRUM_POWER_BANDS, 3), row(SPECTRUM_POWER_BANDS, 4)] }
    const packed = packSpectrum(s)
    expect(packed.count).toBe(2)
    expect(packed.frames).toHaveLength(2 * SPECTRUM_BANDS)
    const back = unpackSpectrum(packed)
    expect(back.fps).toBe(4)
    expect(back.frames).toEqual(s.frames)
    expect(back.power).toEqual(s.power)
    expect(unpackSpectrum(packSpectrum({ fps: 4, frames: s.frames })).power).toBeUndefined()
  })
})

// --- Uncompressed files built in memory ---

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0))
const u16le = (v: number) => [v & 255, v >> 8]
const u32le = (v: number) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, v >>> 24]
const u16be = (v: number) => [v >> 8, v & 255]
const u32be = (v: number) => [v >>> 24, (v >> 16) & 255, (v >> 8) & 255, v & 255]
const chunk = (id: string, body: number[], le = true) => [...ascii(id), ...(le ? u32le : u32be)(body.length), ...body, ...(body.length % 2 ? [0] : [])]

/** Interleaved sample bytes for `planes` in an encoding. */
function encode(planes: number[][], enc: 's16le' | 's24le' | 'f32le' | 'u8' | 's16be' | 'f32be'): number[] {
  const out: number[] = []
  const v = new DataView(new ArrayBuffer(4))
  for (let i = 0; i < planes[0].length; i++) {
    for (const p of planes) {
      const x = p[i]
      if (enc === 'u8') out.push(Math.round(x * 128) + 128)
      else if (enc === 's16le') out.push(...u16le(Math.round(x * 32768) & 0xffff))
      else if (enc === 's16be') out.push(...u16be(Math.round(x * 32768) & 0xffff))
      else if (enc === 's24le') {
        const s = Math.round(x * 8388608) & 0xffffff
        out.push(s & 255, (s >> 8) & 255, s >> 16)
      } else {
        v.setFloat32(0, x, enc === 'f32le')
        out.push(...new Uint8Array(v.buffer))
      }
    }
  }
  return out
}

interface WavOptions {
  tagId?: number
  bits: number
  extensible?: boolean
  /** Written as the data chunk's size instead of the real one. */
  dataSize?: number
  rf64?: boolean
  extra?: number[]
}

function wav(planes: number[][], rate: number, data: number[], o: WavOptions) {
  const ch = planes.length
  const align = (o.bits / 8) * ch
  const base = [...u16le(o.extensible ? 0xfffe : (o.tagId ?? 1)), ...u16le(ch), ...u32le(rate), ...u32le(rate * align), ...u16le(align), ...u16le(o.bits)]
  // The extensible format's sub-format GUID starts with the real format tag.
  const fmt = o.extensible ? [...base, ...u16le(22), ...u16le(o.bits), ...u32le(3), ...u16le(o.tagId ?? 1), ...new Array(14).fill(0)] : base
  const ds64 = o.rf64 ? chunk('ds64', [...u32le(0), ...u32le(0), ...u32le(data.length), ...u32le(0), ...u32le(0), ...u32le(0), ...u32le(0)]) : []
  const dataChunk = [...ascii('data'), ...u32le(o.dataSize ?? data.length), ...data]
  const body = [...ascii('WAVE'), ...ds64, ...chunk('fmt ', fmt), ...(o.extra ?? []), ...dataChunk]
  return new Blob([new Uint8Array([...ascii(o.rf64 ? 'RF64' : 'RIFF'), ...u32le(o.rf64 ? 0xffffffff : body.length), ...body])])
}

/** AIFF's sample rate: an 80-bit extended float. */
function extended(rate: number) {
  const e = Math.floor(Math.log2(rate))
  return [...u16be(16383 + e), ...u32be(rate * 2 ** (31 - e)), ...u32be(0)]
}

function aiff(planes: number[][], rate: number, data: number[], bits: number, compression?: string) {
  const comm = [...u16be(planes.length), ...u32be(planes[0].length), ...u16be(bits), ...extended(rate), ...(compression ? [...ascii(compression), 0, 0] : [])]
  const body = [...ascii(compression ? 'AIFC' : 'AIFF'), ...chunk('COMM', comm, false), ...chunk('SSND', [...u32be(0), ...u32be(0), ...data], false)]
  return new Blob([new Uint8Array([...ascii('FORM'), ...u32be(body.length), ...body])])
}

async function readAll(src: AudioSource, from = 0, to = Infinity) {
  const got: Float32Array[][] = []
  let next = Math.max(0, from)
  await src.read(from, to, (planes, at) => {
    expect(at).toBe(next)
    next += planes[0].length
    got.push(planes)
  })
  return Array.from({ length: src.channels }, (_, c) => [...concat(got.map((g) => g[c]))])
}

describe('reading WAV and AIFF files', () => {
  const planes = [
    [0, 0.5, -0.5, 0.25, -1],
    [0.125, -0.25, 0.75, 0, 0.5]
  ]

  it.each([
    ['16-bit', { bits: 16 }, 's16le'],
    ['24-bit', { bits: 24 }, 's24le'],
    ['8-bit', { bits: 8 }, 'u8'],
    ['32-bit float', { bits: 32, tagId: 3 }, 'f32le'],
    ['extensible 24-bit', { bits: 24, extensible: true }, 's24le'],
    ['extensible float', { bits: 32, tagId: 3, extensible: true }, 'f32le']
  ] as const)('reads %s WAV', async (_, o, enc) => {
    const file = wav(planes, 44100, encode(planes, enc), o)
    const layout = await probePcm(file)
    expect(layout).toMatchObject({ container: 'wav', sampleRate: 44100, channels: 2, encoding: enc, frames: 5 })
    expect(await readAll(pcmSource(file, layout!))).toEqual(planes)
  })

  it('reads past chunks before the samples, and trusts the file over a wrong data size', async () => {
    const data = encode(planes, 's16le')
    // An odd-sized chunk is padded to an even length.
    const extra = chunk('LIST', [...ascii('INFOISFT'), ...u32le(5), ...ascii('rec!'), 0])
    for (const dataSize of [0, 0xffffffff, 1 << 30]) {
      const layout = await probePcm(wav(planes, 48000, data, { bits: 16, dataSize, extra }))
      expect(layout).toMatchObject({ sampleRate: 48000, frames: 5 })
    }
  })

  it('reads RF64 with its 64-bit data size', async () => {
    const file = wav(planes, 96000, encode(planes, 'f32le'), { bits: 32, tagId: 3, rf64: true, dataSize: 0xffffffff })
    const layout = await probePcm(file)
    expect(layout).toMatchObject({ sampleRate: 96000, frames: 5, encoding: 'f32le' })
    expect(await readAll(pcmSource(file, layout!))).toEqual(planes)
  })

  it.each([
    ['AIFF', undefined, 16, 's16be', 's16be'],
    ['AIFF-C sowt', 'sowt', 16, 's16le', 's16le'],
    ['AIFF-C fl32', 'fl32', 32, 'f32be', 'f32be']
  ] as const)('reads %s', async (_, compression, bits, enc, expected) => {
    const file = aiff(planes, 44100, encode(planes, enc), bits, compression)
    const layout = await probePcm(file)
    expect(layout).toMatchObject({ container: 'aiff', sampleRate: 44100, channels: 2, encoding: expected, frames: 5 })
    expect(await readAll(pcmSource(file, layout!))).toEqual(planes)
  })

  it('reads any range, clipped to the file', async () => {
    const file = wav(planes, 44100, encode(planes, 's16le'), { bits: 16 })
    const src = pcmSource(file, (await probePcm(file))!)
    expect(await readAll(src, 1, 3)).toEqual(planes.map((p) => p.slice(1, 3)))
    expect(await readAll(src, -100, 100)).toEqual(planes)
    expect(await readAll(src, 4, 100)).toEqual(planes.map((p) => p.slice(4)))
  })

  it('leaves other files to the decoders', async () => {
    expect(await probePcm(new Blob([new Uint8Array([...ascii('ID3'), 4, 0, 0, 0, 0, 0, 0])]))).toBeNull()
    expect(await probePcm(new Blob([new Uint8Array(ascii('fLaC\0\0\0\x22'))]))).toBeNull()
    // A WAV in a compressed format (here MP3 in WAV, tag 0x55).
    expect(await probePcm(wav(planes, 44100, [1, 2, 3, 4], { bits: 16, tagId: 0x55 }))).toBeNull()
  })
})

// --- MP3 gapless info ---

/**
 * The start of an MP3 file: a first frame holding a Xing/Info tag (and a LAME tag with the
 * encoder's delay and padding), then the next frame's header.
 */
function mp3Start(o: { header: number[]; size: number; sideInfo: number; tag?: string; encoder?: string; frames: number; startPad: number; endPad: number; id3?: boolean }) {
  const frame = new Array(o.size).fill(0)
  frame.splice(0, 4, ...o.header)
  const xing = [...ascii(o.tag ?? 'Info'), ...u32be(0xf), ...u32be(o.frames), ...u32be(123456), ...new Array(100).fill(0), ...u32be(57)]
  const delays = [o.startPad >> 4, ((o.startPad & 15) << 4) | (o.endPad >> 8), o.endPad & 255]
  const lame = [...ascii((o.encoder ?? 'LAME3.100').padEnd(9, ' ')), 0x24, 0x63, 0, 0, 0, 0, 0, 0, 0, 0, 0x01, 0x80, ...delays]
  frame.splice(4 + o.sideInfo, xing.length + lame.length, ...xing, ...lame)
  const id3 = o.id3 ? [...ascii('ID3'), 4, 0, 0, 0, 0, 1, 0, ...new Array(128).fill(0)] : []
  return new Uint8Array([...id3, ...frame, ...o.header, 0, 0, 0, 0])
}

describe('MP3 gapless info', () => {
  // MPEG-1 Layer III, 128 kbps, 44.1 kHz, stereo: 417-byte frames of 1152 samples.
  const mpeg1 = { header: [0xff, 0xfb, 0x90, 0x00], size: 417, sideInfo: 32 }

  it('reads the encoder delay and padding as ffmpeg trims them', () => {
    const g = mp3Gapless(mp3Start({ ...mpeg1, frames: 1000, startPad: 576, endPad: 1000 }))
    expect(g).toEqual({ sampleRate: 44100, skip: 576 + 529, length: 1000 * 1152 - 576 - 1000 })
  })

  it('reads past ID3 tags, and MPEG-2 frames', () => {
    expect(mp3Gapless(mp3Start({ ...mpeg1, frames: 10, startPad: 576, endPad: 0, id3: true }))).toMatchObject({ skip: 1105, length: 10 * 1152 - 576 })
    // MPEG-2 Layer III, 64 kbps, 22.05 kHz, stereo: 576 samples per frame.
    const mpeg2 = { header: [0xff, 0xf3, 0x80, 0x00], size: 208, sideInfo: 17 }
    expect(mp3Gapless(mp3Start({ ...mpeg2, frames: 100, startPad: 1105, endPad: 300, tag: 'Xing' }))).toEqual({ sampleRate: 22050, skip: 1105 + 529, length: 100 * 576 - 1105 - 300 })
  })

  it('trims nothing without a LAME-style tag, as ffmpeg does', () => {
    expect(mp3Gapless(mp3Start({ ...mpeg1, frames: 10, startPad: 576, endPad: 0, encoder: 'GOGO' }))).toBeNull()
    expect(mp3Gapless(mp3Start({ ...mpeg1, frames: 10, startPad: 576, endPad: 0, tag: 'Nope' }))).toBeNull()
    expect(mp3Gapless(new Uint8Array(4096))).toBeNull()
  })
})
