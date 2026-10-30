/**
 * The browser side of the set analysis: decoded audio in, the analysis of whole seconds of it out.
 * Runs the same graph the ffmpeg reference does (scripts/ffmpeg/audio.ts) with the same arithmetic
 * (src/shared/dsp.ts), so both give the same waveform, spectrum and takeovers for a recording.
 */
import { ANALYSIS_STREAMS, createSegmentAnalyser, MAIN_RATE, SEGMENT_TAIL, type SegmentAnalysis, type SegmentRange } from './analysis'
import type { AudioSource } from './audioSource'
import { FilterChain, Resampler, type ResampleKernel } from './dsp'

/** Seconds decoded before a segment's start so its filters settle into the state a full pass has. */
const WARM_UP = 1

/** The streams cut from the main one. */
const BANDS = ['bass', 'vocal'] as const

/** Each side's gain in ffmpeg's stereo-to-mono downmix (-3 dB), as the float ffmpeg uses. */
const SIDE = Math.fround(Math.SQRT1_2)

/**
 * ffmpeg's stereo-to-mono downmix (each side at -3 dB), in float like ffmpeg. Recordings with more
 * channels (rare for a set) use their front pair, where ffmpeg would mix in the others too.
 */
export function downmix(planes: Float32Array[]): Float32Array {
  if (planes.length === 1) return planes[0]
  const [l, r] = planes
  const n = l.length
  const out = new Float32Array(n)
  const f = Math.fround
  for (let i = 0; i < n; i++) out[i] = f(f(l[i] * SIDE) + f(r[i] * SIDE))
  return out
}

/**
 * What a segment needs: the set's input frames [start, end) (end is Infinity for the last segment),
 * and the main stream from `mainFrom`, WARM_UP seconds before the segment, so the band filters
 * settle into the state a full pass has by the time the segment starts.
 */
export function segmentInput(sampleRate: number, range: SegmentRange) {
  const mainFrom = Math.max(0, (range.from - WARM_UP) * MAIN_RATE)
  return {
    mainFrom,
    // The resampler to the main rate looks a few milliseconds back from each output.
    start: sampleRate === MAIN_RATE ? mainFrom : Math.max(0, Math.floor((range.from - WARM_UP - 0.05) * sampleRate)),
    // Past the end: the spectral frames that start before it need a little more, and the resamplers their half-window.
    end: range.to === null ? Infinity : Math.ceil((range.to + SEGMENT_TAIL + 0.05) * sampleRate)
  }
}

export interface PipelineOptions {
  spectrum?: boolean
  kernel?: ResampleKernel
}

/**
 * One segment's analysis, fed the set's mono samples from `start` on (see segmentInput) in order.
 * The same graph as the ffmpeg reference's: resampled to the main rate, then each band's filters
 * at that rate and a resampler to the band's rate. `finish(atEnd)` gives the result; atEnd says
 * the file ended there, so the resamplers finish its last samples as at the end of a full pass.
 */
export function createSegmentPipeline(sampleRate: number, range: SegmentRange, opts: PipelineOptions = {}) {
  const { start, end, mainFrom } = segmentInput(sampleRate, range)
  const seg = createSegmentAnalyser(range, { spectrum: opts.spectrum })
  const toMain = sampleRate === MAIN_RATE ? null : new Resampler(sampleRate, MAIN_RATE, { inputStart: start, outputStart: mainFrom, kernel: opts.kernel })
  const bands = BANDS.map((name) => {
    const spec = ANALYSIS_STREAMS[name]
    return {
      name,
      filters: new FilterChain(spec.filters, MAIN_RATE),
      resampler: new Resampler(MAIN_RATE, spec.rate, { inputStart: mainFrom, outputStart: range.from * spec.rate, kernel: opts.kernel })
    }
  })
  // Main stream samples before the segment only warm up the band filters.
  let warmUp = range.from * MAIN_RATE - mainFrom
  const feedMain = (m: Float32Array) => {
    if (!m.length) return
    const skip = Math.min(warmUp, m.length)
    warmUp -= skip
    if (skip < m.length) seg.push('main', skip ? m.subarray(skip) : m)
    for (const b of bands) {
      const x = m.slice()
      b.filters.process(x)
      const out = b.resampler.push(x)
      if (out.length) seg.push(b.name, out)
    }
  }
  let next = start
  return {
    start,
    end,
    /** Frames of the set pushed so far, from `start`. */
    get pushed() {
      return next - start
    },
    push(mono: Float32Array, at: number) {
      if (at !== next) throw new Error(`Audio skipped from frame ${next} to ${at}`)
      // Anything past `end` isn't needed (a decoder hands over whole packets).
      const x = next + mono.length > end ? mono.subarray(0, Math.max(0, end - next)) : mono
      next += mono.length
      if (x.length) feedMain(toMain ? toMain.push(x) : x)
    },
    finish(atEnd: boolean): SegmentAnalysis {
      if (atEnd) {
        if (toMain) feedMain(toMain.flush())
        for (const b of bands) seg.push(b.name, b.resampler.flush())
      }
      return seg.finish()
    }
  }
}

export interface SegmentOptions extends PipelineOptions {
  signal?: AbortSignal
  /** Seconds of this segment done so far (at most twice a second). */
  onProgress?: (seconds: number) => void
}

/** Analyses the seconds [from, to) of a source (to null: to its end), reading only what it needs. */
export async function analyseSegment(source: AudioSource, range: SegmentRange, opts: SegmentOptions = {}): Promise<SegmentAnalysis> {
  const sr = source.sampleRate
  const r = range.to !== null && range.to * sr >= source.frames ? { from: range.from, to: null } : range
  const p = createSegmentPipeline(sr, r, opts)
  let lastReport = 0
  await source.read(
    p.start,
    p.end,
    (planes, at) => {
      p.push(downmix(planes), at)
      const secs = (at + planes[0].length) / sr - range.from
      if (opts.onProgress && secs - lastReport >= 0.5) {
        lastReport = secs
        opts.onProgress(Math.max(0, secs))
      }
    },
    opts.signal
  )
  return p.finish(p.start + p.pushed >= source.frames)
}

/**
 * Splits a set into about `count` segments of whole seconds, each at least `minLength` long (the
 * last one open-ended, so audio past an estimated duration is still analysed).
 */
export function planSegments(duration: number, count: number, minLength = 20): SegmentRange[] {
  const n = Math.max(1, Math.min(Math.round(count), Math.floor(duration / minLength)))
  const len = Math.max(1, Math.ceil(duration / n))
  const out: SegmentRange[] = []
  for (let from = 0; out.length < n && (from < duration || !out.length); from += len) out.push({ from, to: from + len })
  out[out.length - 1].to = null
  return out
}
