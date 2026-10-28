import { currentIndex, mainTracks } from './layout'
import type { Motion } from './motion'
import type { Msg } from './i18n'
import type { Track } from './types'

export type ClipKind = 'transition' | 'drop' | 'peak'

/** A stretch of the set that should work on its own as a short video. */
export interface ClipSuggestion {
  id: string
  kind: ClipKind
  from: number
  to: number
  /** The moment the clip is built around (takeover, drop, ...); the thumbnail shows just after it. */
  focus: number
  /** Keys under clipText in the UI catalogs; `track`, `from` and `to` values are track names ('' when untitled). */
  title: Msg
  /** Why it was picked, in a few words (keys under clipReason). */
  reason: Msg
  /** 0..1, higher works better. */
  score: number
}

export interface ClipOptions {
  /** Seconds of the build-up shown before the key moment. */
  lead?: number
  /** Seconds after the key moment. */
  after?: number
  /** At most this many suggestions (default 40). */
  max?: number
}

export interface Drop {
  at: number
  /** How long the bass was gone before it came back, seconds. */
  breakdown: number
  /** 0..1: how hard it comes back. */
  strength: number
}

function mean(a: Float32Array, rate: number, from: number, to: number): number {
  const i0 = Math.max(0, Math.floor(from * rate))
  const i1 = Math.min(a.length, Math.ceil(to * rate))
  if (i1 <= i0) return 0
  let s = 0
  for (let i = i0; i < i1; i++) s += a[i]
  return s / (i1 - i0)
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const name = (t: Track) => t.title || t.artist || ''

/**
 * Points where the bass comes back after at least `minBreak` seconds without it: the drops.
 * Scanned on a 0.5 s grid, keeping the strongest point within 20 s, then moved onto the first
 * kick of the drop.
 */
export function findDrops(motion: Motion, duration: number, minBreak = 6): Drop[] {
  const { rate, bassy, kick } = motion
  const step = 0.5
  const found: Drop[] = []
  for (let t = minBreak; t < duration - 4; t += step) {
    const before = mean(bassy, rate, t - minBreak, t - 0.5)
    const after = mean(bassy, rate, t + 0.5, t + 4)
    if (before > 0.3 || after < 0.6) continue
    // How long the breakdown lasted, up to a minute back.
    let back = t - minBreak
    while (back > Math.max(0, t - 60) && mean(bassy, rate, back - 1, back) < 0.35) back -= 1
    const breakdown = t - back
    const kickAfter = mean(kick, rate, t, t + 4)
    const strength = clamp01((after - before) * 0.7 + kickAfter * 0.5)
    found.push({ at: t, breakdown, strength })
  }
  // Non-max suppression: one drop per 20 s.
  found.sort((a, b) => b.strength - a.strength || a.at - b.at)
  const kept: Drop[] = []
  for (const d of found) if (kept.every((k) => Math.abs(k.at - d.at) > 20)) kept.push(d)
  // Snap onto the first bucket where the bass is clearly back.
  for (const d of kept) {
    const i0 = Math.max(0, Math.floor((d.at - 1.5) * rate))
    const i1 = Math.min(bassy.length, Math.ceil((d.at + 2) * rate))
    for (let i = i0; i < i1; i++)
      if (bassy[i] > 0.5) {
        d.at = i / rate
        break
      }
  }
  return kept.sort((a, b) => a.at - b.at)
}

/** Overlap of two ranges as a share of the shorter one. */
const overlap = (a: ClipSuggestion, b: ClipSuggestion) => Math.max(0, Math.min(a.to, b.to) - Math.max(a.from, b.from)) / Math.min(a.to - a.from, b.to - b.from)

/**
 * Suggests clips from the tracklist and the bass/kick motion of the set, best first:
 *  - every transition, built around the takeover, stretched to the drop when one lands right after;
 *  - drops after a breakdown, starting in the breakdown;
 *  - the most driving stretch of a track, when there's room left.
 * A transition scores higher when the drop lands on it, when the blend is long enough to hear both
 * tracks, and when the energy after it is high. Overlapping suggestions keep the better one.
 */
export function suggestClips(tracks: Track[], duration: number, motion: Motion, opts: ClipOptions = {}): ClipSuggestion[] {
  const lead = opts.lead ?? 8
  const after = opts.after ?? 7
  const sorted = mainTracks(tracks)
  const drops = findDrops(motion, duration)
  const { rate, bassy, kick } = motion
  const energy = (from: number, to: number) => mean(kick, rate, from, to) * 0.6 + mean(bassy, rate, from, to) * 0.4
  const fit = (from: number, to: number) => {
    const f = Math.max(0, from)
    return { from: f, to: Math.min(duration, Math.max(to, f + 6)) }
  }
  // A long breakdown makes the drop hit harder, so it counts more than how loud the drop is.
  const dropScore = (d: Drop) => clamp01(0.3 + d.strength * 0.25 + clamp01(d.breakdown / 45) * 0.4)
  const out: ClipSuggestion[] = []

  sorted.forEach((tr, i) => {
    if (i === 0) return
    const prev = sorted[i - 1]
    const blend = tr.mixIn !== undefined ? tr.start - tr.mixIn : 0
    // A drop up to 20 s after the takeover belongs to this transition.
    const drop = drops.find((d) => d.at > tr.start - 2 && d.at <= tr.start + 20)
    const onDrop = drop && Math.abs(drop.at - tr.start) < 3
    const range = fit(tr.start - lead, drop && !onDrop ? drop.at + 4 : tr.start + after)
    const e = energy(tr.start, tr.start + 6)
    // Hearing both tracks for 15–90 s is a real blend; a 2 s cut is less of a moment.
    const blendScore = clamp01(blend / 15) * (blend > 120 ? 0.6 : 1)
    // A transition that carries a drop is worth at least as much as the drop on its own.
    const score = Math.max(clamp01(0.3 + e * 0.35 + blendScore * 0.15 + (drop ? 0.2 + drop.strength * 0.15 : 0)), drop ? dropScore(drop) + 0.05 : 0)
    out.push({
      id: `transition-${tr.id}`,
      kind: 'transition',
      ...range,
      focus: tr.start,
      title: { key: 'transition', values: { from: name(prev), to: name(tr) } },
      reason: onDrop
        ? { key: 'dropOnTakeover' }
        : drop
          ? { key: 'buildsIntoDrop', values: { seconds: Math.round(drop.at - tr.start) } }
          : blend >= 15
            ? { key: 'blend', values: { seconds: Math.round(blend) } }
            : { key: 'quickMix' },
      score
    })
  })

  // Short gaps (a bar or two without bass) are fills, not drops worth a clip of their own.
  for (const d of drops.filter((x) => x.breakdown >= 10)) {
    const tr = sorted[currentIndex(sorted, d.at)]
    out.push({
      id: `drop-${Math.round(d.at * 10)}`,
      kind: 'drop',
      ...fit(d.at - Math.min(12, Math.max(lead, d.breakdown * 0.5)), d.at + 6),
      focus: d.at,
      title: { key: 'drop', values: { track: name(tr) } },
      reason: { key: 'bassBack', values: { seconds: Math.round(d.breakdown) } },
      score: dropScore(d)
    })
  }

  // The most driving 15 s of each track.
  sorted.forEach((tr, i) => {
    const end = i + 1 < sorted.length ? sorted[i + 1].start - lead : duration
    let best = -1
    let at = 0
    for (let t = tr.start + 4; t + 15 <= end; t += 1) {
      const e = energy(t, t + 15)
      if (e > best) {
        best = e
        at = t
      }
    }
    if (best < 0.45) return
    out.push({ id: `peak-${tr.id}`, kind: 'peak', from: at, to: at + 15, focus: at + 2, title: { key: 'peak', values: { track: name(tr) } }, reason: { key: 'peak' }, score: clamp01(best * 0.75) })
  })

  out.sort((a, b) => b.score - a.score || a.from - b.from)
  const kept: ClipSuggestion[] = []
  for (const c of out) if (kept.every((k) => overlap(k, c) < 0.5)) kept.push(c)
  return kept.slice(0, opts.max ?? 40).map((c) => ({ ...c, score: Math.round(c.score * 100) / 100 }))
}

/** Shortest and longest a clip can be trimmed to, seconds. */
export const CLIP_MIN = 5
export const CLIP_MAX = 180

/** The suggestions with the user's own start and end applied, marked `edited`. */
export function applyClipEdits(clips: ClipSuggestion[], edits: Record<string, { from: number; to: number }> | undefined): (ClipSuggestion & { edited?: boolean })[] {
  if (!edits) return clips
  return clips.map((c) => (edits[c.id] ? { ...c, ...edits[c.id], edited: true } : c))
}

const round = (x: number) => Math.round(x * 100) / 100

/**
 * A new length for the clip, keeping its key moment at the same place within it (a transition
 * that lands a third of the way in still does), and inside the set.
 */
export function resizeClip(c: { from: number; to: number; focus: number }, length: number, duration: number): { from: number; to: number } {
  const len = Math.max(CLIP_MIN, Math.min(CLIP_MAX, duration, length))
  const ratio = Math.max(0, Math.min(1, (c.focus - c.from) / Math.max(0.001, c.to - c.from)))
  const from = Math.max(0, Math.min(duration - len, c.focus - ratio * len))
  return { from: round(from), to: round(from + len) }
}

/** Moves one end of the clip by `delta` seconds, keeping it between CLIP_MIN and CLIP_MAX long. */
export function nudgeClip(c: { from: number; to: number }, edge: 'from' | 'to', delta: number, duration: number): { from: number; to: number } {
  if (edge === 'from') {
    const from = Math.max(0, c.to - CLIP_MAX, Math.min(c.from + delta, c.to - CLIP_MIN))
    return { from: round(from), to: c.to }
  }
  const to = Math.min(duration, c.from + CLIP_MAX, Math.max(c.to + delta, c.from + CLIP_MIN))
  return { from: c.from, to: round(to) }
}
