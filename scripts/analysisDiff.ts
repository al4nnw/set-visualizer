/**
 * How two analyses of one recording differ (ffmpeg's reference analysis and the browser's),
 * for scripts/compare-analysis.ts and the browser check in test/browser.
 */
import { detectTakeovers, type SpectralFrames } from '../src/shared/takeover'
import type { Waveform } from '../src/shared/types'

export interface Analysis {
  duration: number
  waveform: Waveform
  spectrum: SpectralFrames
}

export interface ArrayDiff {
  lengths: [number, number]
  /** Share of values that are exactly equal. */
  same: number
  max: number
  /** Values further apart than one step of the 3-decimal rounding. */
  over: number
}

export interface AnalysisDiff {
  waveform: Record<'peaks' | 'rms' | 'bass' | 'vocal', ArrayDiff>
  spectrum: { frames: [number, number]; maxLog: number; maxPower: number }
  takeovers: { same: number; total: number; rows: string[] } | null
}

function diffArrays(a: ArrayLike<number>, b: ArrayLike<number>): ArrayDiff {
  let max = 0
  let over = 0
  let same = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    const d = Math.abs(a[i] - b[i])
    if (d > max) max = d
    // Values are rounded to 3 decimals, so one on a rounding edge can flip by 0.001.
    if (d > 0.0015) over++
    if (d === 0) same++
  }
  return { lengths: [a.length, b.length], same: n ? same / n : 1, max, over }
}

export interface Cues {
  cues: number[]
  songs: Array<{ title: string; artist: string }>
}

export function diffAnalyses(a: Analysis, b: Analysis, cues?: Cues): AnalysisDiff {
  const waveform = Object.fromEntries((['peaks', 'rms', 'bass', 'vocal'] as const).map((k) => [k, diffArrays(a.waveform[k] ?? [], b.waveform[k] ?? [])])) as AnalysisDiff['waveform']
  let maxLog = 0
  let maxPow = 0
  let powScale = 0
  const n = Math.min(a.spectrum.frames.length, b.spectrum.frames.length)
  for (let i = 0; i < n; i++) {
    const fa = a.spectrum.frames[i]
    const fb = b.spectrum.frames[i]
    for (let k = 0; k < fa.length; k++) maxLog = Math.max(maxLog, Math.abs(fa[k] - fb[k]))
    const pa = a.spectrum.power?.[i]
    const pb = b.spectrum.power?.[i]
    if (!pa || !pb) continue
    for (let k = 0; k < pa.length; k++) {
      maxPow = Math.max(maxPow, Math.abs(pa[k] - pb[k]))
      powScale = Math.max(powScale, Math.abs(pa[k]))
    }
  }
  let takeovers: AnalysisDiff['takeovers'] = null
  if (cues) {
    const ta = detectTakeovers(a.spectrum, cues.cues, a.duration, cues.songs)
    const tb = detectTakeovers(b.spectrum, cues.cues, b.duration, cues.songs)
    const fmt = (v: (typeof ta)[number]) => (v ? `start ${v.start.toFixed(2)} audible ${v.audibleAt.toFixed(2)} tail ${v.tailEnd.toFixed(2)}` : 'layered')
    let same = 0
    const rows = ta.map((x, i) => {
      const eq = JSON.stringify(x) === JSON.stringify(tb[i])
      if (eq) same++
      return `${eq ? ' ' : '≠'} ${cues.songs[i].title.slice(0, 28).padEnd(28)} ${fmt(x)} | ${fmt(tb[i])}`
    })
    takeovers = { same, total: ta.length, rows }
  }
  return { waveform, spectrum: { frames: [a.spectrum.frames.length, b.spectrum.frames.length], maxLog, maxPower: maxPow / (powScale || 1) }, takeovers }
}

export function formatDiff(d: AnalysisDiff, labels = ['ffmpeg', 'browser']) {
  const len = (l: [number, number]) => (l[0] === l[1] ? `${l[0]}` : `${l[0]} vs ${l[1]}`)
  const out = ['waveform:']
  for (const [k, v] of Object.entries(d.waveform))
    out.push(`  ${k.padEnd(6)} length ${len(v.lengths).padEnd(14)} identical ${(v.same * 100).toFixed(2).padStart(6)}%  max diff ${v.max.toFixed(4)}  over 0.001: ${v.over}`)
  out.push(`spectrum: frames ${len(d.spectrum.frames)}, max diff in log bands ${d.spectrum.maxLog.toExponential(2)}, in power ${d.spectrum.maxPower.toExponential(2)} of its largest value`)
  if (d.takeovers) {
    out.push(`takeovers (${labels[0]} | ${labels[1]}):`)
    for (const r of d.takeovers.rows) out.push(`  ${r}`)
    out.push(`  ${d.takeovers.same} of ${d.takeovers.total} identical`)
  }
  return out.join('\n')
}

/** Cue times and songs from a cue sheet, as the app passes them to takeover detection. */
export function cuesFrom(entries: Array<{ title: string; artist: string; start?: number }>): Cues {
  const timed = entries.filter((e) => e.start !== undefined).sort((x, y) => x.start! - y.start!)
  return { cues: timed.map((e) => e.start!), songs: timed.map((e) => ({ title: e.title, artist: e.artist })) }
}
