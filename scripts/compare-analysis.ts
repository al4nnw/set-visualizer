/**
 * Checks the browser analysis (src/shared/analyseSource.ts, run here in Node) against ffmpeg's
 * analysis of the same recording (scripts/ffmpeg/audio.ts), and times both:
 *   npm run compare-analysis -- <audio> [--cue set.cue] [--segments 8]
 * WAV and AIFF are read directly, as the browser reads them. Other formats are decoded to a float
 * WAV by ffmpeg first, so for those this checks the analysis but not the browser's decoders (the
 * browser check, npm run test:browser, covers those).
 */
import { openAsBlob } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { analyseAudio } from './ffmpeg/audio'
import { runFfmpeg } from './ffmpeg/ffmpeg'
import { mergeSegments, type SegmentAnalysis } from '../src/shared/analysis'
import { analyseSegment, planSegments } from '../src/shared/analyseSource'
import { pcmSource, probePcm } from '../src/shared/pcm'
import { dropRepeatedLoads, parseTracklist } from '../src/shared/tracklist'
import { cuesFrom, diffAnalyses, formatDiff } from './analysisDiff'

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main() {
  if (!process.argv[2] || process.argv[2].startsWith('--')) throw new Error('usage: compare-analysis <audio> [--cue file.cue] [--segments n]')
  const file = resolve(process.argv[2])
  const segments = Number(arg('segments') ?? 8)

  let t = performance.now()
  const reference = await analyseAudio(file, undefined, { spectrum: true })
  const ffmpegMs = performance.now() - t
  console.log(`ffmpeg analysis: ${reference.duration.toFixed(2)} s of audio in ${(ffmpegMs / 1000).toFixed(2)} s`)

  let blob = await openAsBlob(file)
  let layout = await probePcm(blob)
  let tmp: string | null = null
  if (!layout) {
    tmp = await mkdtemp(join(tmpdir(), 'setvis-'))
    const wav = join(tmp, 'decoded.wav')
    await runFfmpeg(['-i', file, '-vn', '-c:a', 'pcm_f32le', wav])
    blob = await openAsBlob(wav)
    layout = await probePcm(blob)
    if (!layout) throw new Error('ffmpeg wrote a WAV this reader cannot read')
    console.log('(not WAV or AIFF: decoded to float WAV by ffmpeg first)')
  }
  const source = pcmSource(blob, layout)
  const plan = planSegments(source.duration, segments)
  t = performance.now()
  const parts: SegmentAnalysis[] = []
  const times: number[] = []
  // One after another: here they share one thread; in the browser each runs in its own worker.
  for (const range of plan) {
    const t0 = performance.now()
    parts.push(await analyseSegment(source, range, { spectrum: true }))
    times.push(performance.now() - t0)
  }
  const merged = mergeSegments(parts)
  const browserMs = performance.now() - t
  if (tmp) await rm(tmp, { recursive: true, force: true })
  console.log(
    `browser analysis: ${plan.length} segments, ${(browserMs / 1000).toFixed(2)} s on one thread (${(source.duration / (browserMs / 1000)).toFixed(0)}x realtime; ` +
      `the longest segment took ${(Math.max(...times) / 1000).toFixed(2)} s)`
  )
  const cue = arg('cue')
  const cues = cue ? cuesFrom(dropRepeatedLoads(parseTracklist(await readFile(cue)))) : undefined
  const browser = { duration: source.duration, waveform: merged.waveform, spectrum: merged.spectrum! }
  console.log(formatDiff(diffAnalyses({ ...reference, spectrum: reference.spectrum! }, browser, cues)))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
