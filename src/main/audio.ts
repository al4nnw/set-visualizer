import { spawn } from 'node:child_process'
import type { Readable } from 'node:stream'
import type { Waveform } from '@shared/types'
import type { SpectralFrames } from '@shared/takeover'
import { ANALYSIS_STREAMS, createSetAnalyser, SPECTRUM_RATE, spectralAccumulator, type StreamName, type StreamSpec } from '@shared/analysis'
import { ffmpegPath, probeDuration } from './ffmpeg'

/** The stream's filter stages as an ffmpeg filter chain (ffmpeg's lowpass/highpass are 2-pole biquads). */
const ffmpegFilter = (s: StreamSpec) => s.filters.map((st) => `${st.type}=f=${st.f}`).join(',') || null

/**
 * Decodes the file once and splits it into several mono f32 streams (one ffmpeg, one output pipe
 * each: stdout, then fd 3, 4, ...). `onSamples` gets each stream's samples as they arrive.
 */
function decodeStreams(file: string, streams: StreamSpec[], onSamples: (stream: number, samples: Float32Array) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const n = streams.length
    // Downmixed once before the split, so the filters run on one channel instead of two.
    const split = n > 1 ? `[0:a]aformat=sample_fmts=flt:channel_layouts=mono,asplit=${n}${streams.map((_, i) => `[s${i}]`).join('')};` : ''
    const graph =
      split +
      streams
        .map((s, i) => {
          const src = n > 1 ? `[s${i}]` : '[0:a]'
          const filter = ffmpegFilter(s)
          return `${src}${filter ? filter + ',' : ''}aformat=sample_fmts=flt:sample_rates=${s.rate}:channel_layouts=mono[o${i}]`
        })
        .join(';')
    const fds = streams.map((_, i) => (i === 0 ? 1 : i + 2))
    const args = ['-hide_banner', '-loglevel', 'error', '-i', file, '-vn', '-filter_complex', graph]
    streams.forEach((_, i) => args.push('-map', `[o${i}]`, '-f', 'f32le', `pipe:${fds[i]}`))
    const p = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe', ...fds.slice(1).map(() => 'pipe' as const)] })
    let err = ''
    p.stderr!.on('data', (d) => (err += d))
    fds.forEach((fd, i) => {
      // Samples can straddle chunks, so carry the odd bytes over to the next one.
      let leftover: Buffer = Buffer.alloc(0)
      ;(p.stdio[fd] as Readable).on('data', (chunk: Buffer) => {
        const buf = leftover.length ? Buffer.concat([leftover, chunk]) : chunk
        const usable = buf.length - (buf.length % 4)
        // A Float32Array view needs 4-byte alignment; Node's pooled chunks don't always have it.
        const samples =
          buf.byteOffset % 4 === 0 ? new Float32Array(buf.buffer, buf.byteOffset, usable / 4) : new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + usable))
        leftover = buf.subarray(usable)
        onSamples(i, samples)
      })
    })
    p.on('error', reject)
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`Could not decode audio: ${err.slice(-500)}`))))
  })
}

const STREAMS: StreamName[] = ['main', 'bass', 'vocal']

/**
 * Builds the waveform (full signal, bass and vocal band envelopes) from one decode of the set and,
 * with `spectrum`, the spectral frames for takeover detection from the same samples.
 */
export async function analyseAudio(
  file: string,
  onProgress?: (p: number) => void,
  opts: { spectrum?: boolean } = {}
): Promise<{ duration: number; waveform: Waveform; spectrum?: SpectralFrames }> {
  const duration = await probeDuration(file)
  const analyser = createSetAnalyser(opts)
  let lastReport = 0
  await decodeStreams(
    file,
    STREAMS.map((n) => ANALYSIS_STREAMS[n]),
    (i, samples) => {
      analyser.push(STREAMS[i], samples)
      if (i !== 0) return
      const progress = analyser.seconds() / Math.max(1, duration)
      if (onProgress && progress - lastReport > 0.01) {
        lastReport = progress
        onProgress(Math.min(1, progress))
      }
    }
  )
  return { duration, ...analyser.finish() }
}

/** Spectral frames on their own (when they weren't kept from the analysis). */
export async function spectralFrames(file: string): Promise<SpectralFrames> {
  const spectrum = spectralAccumulator()
  await decodeStreams(file, [{ filters: [], rate: SPECTRUM_RATE }], (_, samples) => spectrum.push(samples))
  return spectrum.finish()
}
