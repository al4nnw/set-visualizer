import type { Waveform } from './types'

/**
 * What drives the track cards' movement, precomputed per waveform bucket:
 * - `kick`: a sharp hit on each bass onset that decays in ~0.2 s, measured against the bass level
 *   of the surrounding few seconds so quiet sections bounce as clearly as loud ones.
 * - `vocal`: a smoothed envelope of the vocal band (250 Hz to 3.5 kHz), also relative to its
 *   surroundings, for a slower "breathing" when there's no beat.
 * - `bassy`: 0..1, how much bass there is right now; it fades between the two.
 * - `soft`: the resulting bounce, smoothed with a slower attack and a long release, for things that
 *   should float with the music rather than hit with it (the track text under the artwork).
 */
export interface Motion {
  rate: number
  kick: Float32Array
  vocal: Float32Array
  bassy: Float32Array
  soft?: Float32Array
}

const cache = new WeakMap<Waveform, Motion>()

/** Max of `a` within ±`radius` buckets, computed per block so it stays linear in the set length. */
function localMax(a: ArrayLike<number>, radius: number): Float32Array {
  const n = a.length
  const block = Math.max(1, Math.round(radius / 2))
  const blocks = Math.ceil(n / block)
  const bm = new Float32Array(blocks)
  for (let i = 0; i < n; i++) {
    const b = (i / block) | 0
    if (a[i] > bm[b]) bm[b] = a[i]
  }
  const out = new Float32Array(n)
  const span = Math.ceil(radius / block)
  for (let b = 0; b < blocks; b++) {
    let m = 0
    for (let k = Math.max(0, b - span); k <= Math.min(blocks - 1, b + span); k++) if (bm[k] > m) m = bm[k]
    for (let i = b * block; i < Math.min(n, (b + 1) * block); i++) out[i] = m
  }
  return out
}

/** One-pole smoothing with separate attack and release times (seconds). */
function follow(a: ArrayLike<number>, rate: number, attack: number, release: number): Float32Array {
  const out = new Float32Array(a.length)
  const ka = attack > 0 ? 1 - Math.exp(-1 / (attack * rate)) : 1
  const kr = 1 - Math.exp(-1 / (release * rate))
  let y = 0
  for (let i = 0; i < a.length; i++) {
    const x = a[i]
    y += (x - y) * (x > y ? ka : kr)
    out[i] = y
  }
  return out
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function percentile(a: ArrayLike<number>, p: number): number {
  const copy = Float32Array.from(a).sort()
  return copy.length ? copy[Math.min(copy.length - 1, Math.floor(copy.length * p))] : 0
}

export function buildMotion(wf: Waveform): Motion {
  const hit = cache.get(wf)
  if (hit) return hit
  const { rate } = wf
  const n = wf.bass.length
  const bass = wf.bass
  // Older projects have no vocal band; the full-signal RMS is the closest thing (it's mostly mids
  // once the bass drops out).
  const voc = wf.vocal?.length === n ? wf.vocal : wf.rms

  // Kick: rise of the bass above its own recent average, against the local bass ceiling.
  const slow = follow(bass, rate, 0.25, 0.25)
  const ceiling = localMax(bass, Math.round(3 * rate))
  const kick = new Float32Array(n)
  const decay = Math.exp(-1 / (0.18 * rate))
  let k = 0
  for (let i = 0; i < n; i++) {
    const top = Math.max(ceiling[i], 0.04)
    const onset = Math.max(0, bass[i] - slow[i]) / (top * 0.45)
    const level = bass[i] / top
    // Mostly the onset, plus a little of the level so a sustained sub still moves.
    const v = Math.min(1, Math.pow(Math.min(1, onset), 0.8) * 0.85 + Math.pow(level, 3) * 0.25)
    k = Math.max(v, k * decay)
    kick[i] = k
  }

  // Bass presence against the set's typical bass level, smoothed so the blend doesn't flicker.
  const typical = Math.max(1e-3, percentile(bass, 0.9))
  const presence = follow(
    Array.from(bass, (b) => b / typical),
    rate,
    0.3,
    1.2
  )
  const bassy = presence.map((p) => smoothstep(0.18, 0.5, p))

  // Vocals: syllable-rate envelope, relative to the last few seconds, gently compressed.
  const env = follow(voc, rate, 0.04, 0.22)
  const vceil = localMax(env, Math.round(4 * rate))
  const vfloor = Math.max(1e-3, percentile(env, 0.2))
  const vocal = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const top = Math.max(vceil[i], vfloor * 2)
    vocal[i] = Math.pow(Math.max(0, (env[i] - vfloor) / (top - vfloor)), 1.4)
  }

  const beat = new Float32Array(n)
  for (let i = 0; i < n; i++) beat[i] = beatOf(kick[i], vocal[i], bassy[i])
  const soft = follow(beat, rate, 0.09, 0.32)

  const m = { rate, kick, vocal, bassy, soft }
  cache.set(wf, m)
  return m
}

const sample = (a: Float32Array, rate: number, t: number) => {
  if (!a.length) return 0
  const pos = Math.max(0, t * rate)
  const i = Math.min(a.length - 1, Math.floor(pos))
  const j = Math.min(a.length - 1, i + 1)
  const f = pos - Math.floor(pos)
  return a[i] * (1 - f) + a[j] * f
}

const beatOf = (kick: number, vocal: number, bassy: number) => kick * bassy + vocal * 0.55 * (1 - bassy)

/**
 * Card movement at time t, 0..1 each: `beat` is the bounce (kicks where there's bass, vocals
 * where there isn't), `glow` the glow's swell and `soft` the smoothed bounce.
 */
export function motionAt(m: Motion, t: number): { beat: number; glow: number; soft: number } {
  const kick = sample(m.kick, m.rate, t)
  const vocal = sample(m.vocal, m.rate, t)
  const bassy = sample(m.bassy, m.rate, t)
  const beat = beatOf(kick, vocal, bassy)
  return {
    beat,
    glow: kick * bassy * 0.9 + vocal * 0.8 * (1 - bassy),
    soft: m.soft ? sample(m.soft, m.rate, t) : beat
  }
}
