import type { IdentifyHit, Track } from './types'
import { alternateDecks, parseTime } from './layout'

export interface ParsedEntry {
  title: string
  artist: string
  /** Seconds, or undefined when the source has no timing (e.g. a Rekordbox history export). */
  start?: number
  /** Where the track starts being mixed in, when known separately from `start`. */
  mixIn?: number
  /**
   * True when `start` is when the deck started playing (DJ software cue sheets) rather than when the
   * track takes over, so the takeover should be found in the audio.
   */
  startIsDeckStart?: boolean
  /** Never takes over: only mixed in under another track. */
  layered?: boolean
  audibleAt?: number
  tailEnd?: number
}

let idCounter = 0
export const newId = () => `t${Date.now().toString(36)}${(idCounter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`

/** Decodes a tracklist file. Rekordbox writes its playlist .txt exports as UTF-16LE. */
export function decodeText(buf: Uint8Array): string {
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf.subarray(2))
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder('utf-16be').decode(buf.subarray(2))
  // UTF-16LE without BOM: lots of zero bytes at odd positions.
  let zeros = 0
  const n = Math.min(buf.length, 400)
  for (let i = 1; i < n; i += 2) if (buf[i] === 0) zeros++
  if (n > 10 && zeros > n / 4) return new TextDecoder('utf-16le').decode(buf)
  return new TextDecoder('utf-8').decode(buf).replace(/^﻿/, '')
}

function splitArtistTitle(s: string): { artist: string; title: string } {
  const m = /^(.*?)\s+[-–—]\s+(.*)$/.exec(s.trim())
  if (m) return { artist: m[1].trim(), title: m[2].trim() }
  return { artist: '', title: s.trim() }
}

/**
 * DJ software logs a track again when a deck that still holds it goes back on air. With two decks,
 * an entry for a song that's already on one of them (one of the last two different songs) is the
 * same play continuing, not a new one, so it's dropped.
 */
export function dropRepeatedLoads(entries: ParsedEntry[], decks = 2): ParsedEntry[] {
  const sorted = [...entries].sort((a, b) => (a.start ?? 0) - (b.start ?? 0))
  const loaded: ParsedEntry[] = []
  const keep = new Set<ParsedEntry>()
  for (const e of sorted) {
    if (loaded.some((l) => sameSong(l, e))) continue
    keep.add(e)
    loaded.push(e)
    if (loaded.length > decks) loaded.shift()
  }
  return entries.filter((e) => keep.has(e))
}

/**
 * For cue sheets from DJ software, moves each track's start to where it takes over in the audio and
 * keeps the cue time as the moment it appears on the right. `find` maps sorted cue times to takeovers,
 * or null for a track that never takes over (it's marked as layered and keeps its cue as its start).
 */
export async function placeTakeovers(
  entries: ParsedEntry[],
  find: (
    cues: number[],
    songs: Array<{ title: string; artist: string }>
  ) => Promise<Array<{ start: number; audibleAt?: number; tailEnd: number } | null>>
): Promise<ParsedEntry[]> {
  if (!entries.length || !entries.every((e) => e.start !== undefined && e.startIsDeckStart)) return entries
  entries = dropRepeatedLoads(entries)
  const order = entries.map((e, i) => i).sort((a, b) => entries[a].start! - entries[b].start!)
  const takeovers = await find(
    order.map((i) => entries[i].start!),
    order.map((i) => ({ title: entries[i].title, artist: entries[i].artist }))
  )
  const out = [...entries]
  let lastMain = -1
  order.forEach((i, k) => {
    const cue = entries[i].start!
    const x = takeovers[k]
    if (x === null) {
      out[i] = { ...entries[i], layered: true, startIsDeckStart: false }
      return
    }
    out[i] = {
      ...entries[i],
      start: x.start,
      mixIn: x.start > cue ? cue : undefined,
      audibleAt: x.audibleAt !== undefined && x.audibleAt < x.start ? x.audibleAt : undefined,
      startIsDeckStart: false
    }
    // The track this one replaces keeps playing underneath until the crossfade ends.
    if (lastMain >= 0 && x.tailEnd > x.start) out[lastMain] = { ...out[lastMain], tailEnd: x.tailEnd }
    lastMain = i
  })
  return out
}

const unquote = (s: string) => s.trim().replace(/^"(.*)"$/, '$1')

/**
 * CUE sheet: TRACK / TITLE / PERFORMER / INDEX 01 mm:ss:ff (75 frames per second).
 * Rekordbox recordings ("REM RECORDED_BY "rekordbox-dj"") break the spec and write INDEX as hh:mm:ss.
 */
export function parseCue(text: string): ParsedEntry[] {
  const out: ParsedEntry[] = []
  let cur: ParsedEntry | null = null
  const indexes: Array<[ParsedEntry, number, number, number]> = []
  let hms = /^\s*REM\s+RECORDED_BY\s+"?rekordbox/im.test(text)
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    const [kw, ...rest] = line.split(/\s+/)
    const arg = rest.join(' ')
    switch (kw?.toUpperCase()) {
      case 'TRACK':
        cur = { title: '', artist: '', startIsDeckStart: true }
        out.push(cur)
        break
      case 'TITLE':
        if (cur) cur.title = unquote(arg)
        break
      case 'PERFORMER':
        if (cur) cur.artist = unquote(arg)
        break
      case 'INDEX': {
        if (!cur || rest[0] !== '01') break
        const m = /^(\d+):(\d+):(\d+)$/.exec(rest[1] ?? '')
        if (!m) break
        indexes.push([cur, +m[1], +m[2], +m[3]])
        // A third field of 75 or more can't be a frame count.
        if (+m[3] >= 75) hms = true
        break
      }
    }
  }
  for (const [e, a, b, c] of indexes) e.start = hms ? a * 3600 + b * 60 + c : a * 60 + b + c / 75
  return out
}

/** Rekordbox "Export playlist (.txt)": tab separated with a header row ("Track Title", "Artist", ...). */
export function parseRekordboxTxt(text: string): ParsedEntry[] | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (!lines.length || !lines[0].includes('\t')) return null
  const header = lines[0].split('\t').map((h) => h.trim().toLowerCase())
  const ti = header.findIndex((h) => h === 'track title' || h === 'title' || h === 'name')
  const ai = header.findIndex((h) => h === 'artist')
  if (ti < 0) return null
  // Some exports (and third-party history tools) include a time column.
  const timeIdx = header.findIndex((h) => ['start time', 'start', 'time played', 'played at', 'cue'].includes(h))
  return lines.slice(1).map((l) => {
    const cols = l.split('\t')
    const e: ParsedEntry = { title: (cols[ti] ?? '').trim(), artist: ai >= 0 ? (cols[ai] ?? '').trim() : '' }
    if (timeIdx >= 0) {
      const t = parseTime(cols[timeIdx] ?? '')
      if (!Number.isNaN(t)) e.start = t
    }
    return e
  })
}

/** M3U/M3U8: "#EXTINF:duration,Artist - Title" lines. No start times. */
export function parseM3u(text: string): ParsedEntry[] {
  const out: ParsedEntry[] = []
  for (const line of text.split(/\r?\n/)) {
    const m = /^#EXTINF:[^,]*,(.*)$/.exec(line.trim())
    if (m) out.push(splitArtistTitle(m[1]))
  }
  return out
}

/**
 * Free-form tracklists as people paste them in YouTube descriptions:
 *   "00:00 Artist - Title", "[1:02:03] Artist - Title", "1. Artist - Title (12:30)"
 */
export function parsePlainList(text: string): ParsedEntry[] {
  const out: ParsedEntry[] = []
  const timeRe = /(\d{1,2}:\d{2}(?::\d{2})?)/
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim()
    if (!line || line.startsWith('#')) continue
    let start: number | undefined
    const tm = timeRe.exec(line)
    if (tm) {
      start = parseTime(tm[1])
      line = (line.slice(0, tm.index) + line.slice(tm.index + tm[1].length))
        .replace(/[\[(]\s*[\])]/g, ' ')
        .trim()
    }
    line = line.replace(/^\d{1,3}[.)]\s+/, '').replace(/^[-–—|:]\s*/, '').replace(/\s*[-–—|]$/, '').trim()
    if (!line) continue
    out.push({ ...splitArtistTitle(line), start })
  }
  return out
}

export function parseTracklist(fileName: string, buf: Uint8Array): ParsedEntry[] {
  const text = decodeText(buf)
  const ext = fileName.toLowerCase().split('.').pop()
  if (ext === 'cue') return parseCue(text)
  if (ext === 'm3u' || ext === 'm3u8') return parseM3u(text)
  return parseRekordboxTxt(text) ?? parsePlainList(text)
}

/**
 * Turns parsed entries into tracks. Entries without times are spread evenly over the set
 * so they show up on the timeline and can be dragged into place.
 */
export function entriesToTracks(entries: ParsedEntry[], duration: number): Track[] {
  const n = entries.length
  const timed = entries.filter((e) => e.start !== undefined).length
  const tracks: Track[] = entries.map((e, i) => ({
    id: newId(),
    title: e.title,
    artist: e.artist,
    start: timed === n ? e.start! : (duration / Math.max(1, n)) * i,
    mixIn: timed === n ? e.mixIn : undefined,
    ...(timed === n && e.layered ? { layered: true } : {}),
    ...(timed === n && e.audibleAt !== undefined ? { audibleAt: e.audibleAt } : {}),
    ...(timed === n && e.tailEnd !== undefined ? { tailEnd: e.tailEnd } : {}),
    deck: 'A'
  }))
  return alternateDecks(tracks)
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/feat\.?.*$/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

export const sameSong = (a: { title: string; artist: string }, b: { title: string; artist: string }) =>
  norm(a.title) === norm(b.title) && (norm(a.artist) === norm(b.artist) || !a.artist || !b.artist)

/**
 * Collapses periodic fingerprint hits into a tracklist. A song is accepted once it's been heard
 * `minHits` times (or once if it's the only thing heard in that stretch), and starts at its first hit.
 */
export function mergeHits(hits: IdentifyHit[], minHits = 1): Array<IdentifyHit & { count: number }> {
  const sorted = [...hits].sort((a, b) => a.at - b.at)
  const groups: Array<IdentifyHit & { count: number }> = []
  for (const h of sorted) {
    const last = groups[groups.length - 1]
    if (last && sameSong(last, h)) {
      last.count++
      if (!last.artwork && h.artwork) last.artwork = h.artwork
      continue
    }
    // An earlier song heard again after a short blip from another song (common in long blends).
    const prev = groups[groups.length - 2]
    if (prev && last && last.count === 1 && sameSong(prev, h)) {
      groups.pop()
      prev.count++
      continue
    }
    groups.push({ ...h, count: 1 })
  }
  return groups.filter((g, i, all) => g.count >= minHits || all.length === 1)
}
