/**
 * Scores the cue sheet import against a project whose timings were checked by hand:
 *   npm run eval-analysis -- <audio> <set.cue> <reference.djvis> [--clips]
 * Analyses the audio as the browser does (WAV/AIFF only), places the cue sheet's tracks the way
 * File ▸ Import does, and prints, per track and overall, how far mix in, takes over and plays until
 * land from the reference (a track without a tail counts as ending at the next takeover, which is
 * what the video shows). --clips also lists the top clip suggestions.
 * Use it before and after changing takeover.ts or transitions.ts, on more than one set.
 */
import { openAsBlob } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { mergeSegments, type SegmentAnalysis } from '../src/shared/analysis'
import { analyseSegment, planSegments } from '../src/shared/analyseSource'
import { suggestClips } from '../src/shared/clips'
import { buildMotion } from '../src/shared/motion'
import { pcmSource, probePcm } from '../src/shared/pcm'
import { detectTakeovers } from '../src/shared/takeover'
import { entriesToTracks, parseTracklist, placeTakeovers, sameSong } from '../src/shared/tracklist'
import type { Track } from '../src/shared/types'

const FIELDS = ['mixIn', 'start', 'tailEnd'] as const

async function main() {
  const [audio, cueFile, refFile] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  if (!refFile) throw new Error('usage: eval-analysis <audio> <set.cue> <reference.djvis> [--clips]')
  const blob = await openAsBlob(resolve(audio))
  const layout = await probePcm(blob)
  if (!layout) throw new Error('Only WAV and AIFF are read here')
  const source = pcmSource(blob, layout)
  const parts: SegmentAnalysis[] = []
  for (const range of planSegments(source.duration, 8)) parts.push(await analyseSegment(source, range, { spectrum: true }))
  const { waveform, spectrum } = mergeSegments(parts)
  const duration = source.duration

  const entries = parseTracklist(await readFile(cueFile))
  const t0 = performance.now()
  const placed = await placeTakeovers(entries, async (cues, songs) => detectTakeovers(spectrum!, cues, duration, songs))
  console.log(`takeovers found in ${((performance.now() - t0) / 1000).toFixed(2)} s`)
  const tracks = entriesToTracks(placed, duration)
  // A track without a tail stops being shown when the next one takes over.
  const main = tracks.filter((t) => !t.layered).sort((a, b) => a.start - b.start)
  main.forEach((t, i) => {
    if (t.tailEnd === undefined && i + 1 < main.length) t.tailEnd = main[i + 1].start
  })

  const ref: { tracks: Track[] } = JSON.parse(await readFile(refFile, 'utf8'))
  const errs: Record<string, number[]> = { mixIn: [], start: [], tailEnd: [] }
  const fmt = (x?: number) => (x === undefined ? '-' : x.toFixed(1)).padStart(7)
  for (const r of ref.tracks) {
    const t = tracks.find((x) => sameSong(x, r))
    if (!t) {
      console.log(`${r.title}: not in the cue sheet's result`)
      continue
    }
    const row = [r.title.slice(0, 24).padEnd(24)]
    for (const k of FIELDS) {
      const want = r[k]
      const got = t[k]
      row.push(`${k} ${fmt(want)} got ${fmt(got)}`)
      // The first track's mix in is the start of the set: nothing to find.
      if (want === undefined || (k === 'mixIn' && want === 0)) continue
      errs[k].push(got === undefined ? NaN : got - want)
    }
    console.log(row.join(' | ') + (t.layered ? ' (layered)' : ''))
  }
  for (const [k, v] of Object.entries(errs)) {
    const ok = v.filter((x) => !isNaN(x)).map(Math.abs).sort((a, b) => a - b)
    if (!ok.length) continue
    const mae = ok.reduce((s, x) => s + x, 0) / ok.length
    const within = (s: number) => ok.filter((x) => x <= s).length
    console.log(
      `${k.padEnd(8)} n=${v.length} missing=${v.length - ok.length} mean error ${mae.toFixed(1)} s, median ${ok[ok.length >> 1].toFixed(1)} s, ` +
        `within 2 s: ${within(2)}, 5 s: ${within(5)}, 10 s: ${within(10)}, worst ${ok[ok.length - 1].toFixed(1)} s`
    )
  }

  if (process.argv.includes('--clips')) {
    const mmss = (x: number) => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, '0')}`
    for (const c of suggestClips(tracks, duration, buildMotion(waveform)).slice(0, 15))
      console.log(c.kind.padEnd(10), `${mmss(c.from)}-${mmss(c.to)}`.padEnd(12), `${(c.to - c.from).toFixed(1)} s`.padEnd(7), c.score, c.reason.key, JSON.stringify(c.title.values ?? {}))
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
