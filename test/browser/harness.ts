/**
 * Page side of the browser analysis check (run.ts): analyses recordings served next to it with the
 * web app's analysis (src/renderer/src/analysis) and hands the results back, packed as base64.
 */
import { AnalysisError, analyseFile, detectTakeoversOffThread } from '../../src/renderer/src/analysis'

const b64 = (a: Float32Array) => {
  const bytes = new Uint8Array(a.buffer, a.byteOffset, a.byteLength)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

async function analyse(url: string, opts: { threads?: number; cues?: number[]; songs?: Array<{ title: string; artist: string }> } = {}) {
  const file = await (await fetch(url)).blob()
  const t0 = performance.now()
  const r = await analyseFile(file, { threads: opts.threads })
  const ms = performance.now() - t0
  const takeovers = opts.cues ? await detectTakeoversOffThread(r.spectrum, opts.cues, r.duration, opts.songs) : null
  const w = r.waveform
  return {
    duration: r.duration,
    codec: r.codec,
    ms,
    threads: opts.threads ?? navigator.hardwareConcurrency,
    waveform: { rate: w.rate, peaks: b64(Float32Array.from(w.peaks)), rms: b64(Float32Array.from(w.rms)), bass: b64(Float32Array.from(w.bass)), vocal: b64(Float32Array.from(w.vocal ?? [])) },
    spectrum: { fps: r.spectrum.fps, count: r.spectrum.count, frames: b64(r.spectrum.frames), power: b64(r.spectrum.power) },
    takeovers
  }
}

const blob = async (url: string) => (await fetch(url)).blob()

/** How an analysis ended: 'finished', or the reason it failed (with the codec it names, if any). */
const outcome = (p: Promise<unknown>) =>
  p.then(
    () => 'finished',
    (e) => (e instanceof AnalysisError ? e.reason + (e.codec ? `:${e.codec}` : '') : `unexpected: ${e}`)
  )

/** Cancelled as soon as it has started, then run again to the end. */
async function cancelThenRun(url: string) {
  const file = await blob(url)
  const ctl = new AbortController()
  const cancelled = await outcome(analyseFile(file, { signal: ctl.signal, onProgress: () => ctl.abort() }))
  return [cancelled, await outcome(analyseFile(file))]
}

/** What the user is told for files the analysis can't finish. */
async function failures(urls: { pcm: string; compressed: string; unsupported: string }) {
  return {
    cancelPcm: await cancelThenRun(urls.pcm),
    cancelCompressed: await cancelThenRun(urls.compressed),
    notAudio: await outcome(analyseFile(new Blob(['not really audio, just text']))),
    unsupported: await outcome(analyseFile(await blob(urls.unsupported)))
  }
}

;(window as unknown as { harness: unknown }).harness = { analyse, failures }
