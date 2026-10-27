import { describe, expect, it } from 'vitest'
import { parseCue, parsePlainList, parseRekordboxTxt, decodeText, mergeHits, entriesToTracks, placeTakeovers } from '../src/shared/tracklist'
import { detectTakeovers, stepUp, FALLBACK_TAKEOVER } from '../src/shared/takeover'
import { cardStates, parseTime, formatTime } from '../src/shared/layout'
import type { Track } from '../src/shared/types'

describe('tracklist parsing', () => {
  it('parses cue sheets', () => {
    const cue = `PERFORMER "DJ"\nTITLE "Set"\nFILE "rec.wav" WAVE\n  TRACK 01 AUDIO\n    TITLE "Song One"\n    PERFORMER "Artist A"\n    INDEX 01 00:00:00\n  TRACK 02 AUDIO\n    TITLE "Song Two"\n    PERFORMER "Artist B"\n    INDEX 01 05:30:37\n`
    const r = parseCue(cue)
    expect(r).toHaveLength(2)
    expect(r[1]).toMatchObject({ title: 'Song Two', artist: 'Artist B' })
    expect(r[1].start).toBeCloseTo(330 + 37 / 75)
  })

  it('reads Rekordbox recording cue sheets as hh:mm:ss', () => {
    const cue = `REM RECORDED_BY "rekordbox-dj"\nTITLE "Set"\nFILE "rec.wav" WAVE\n\tTRACK 01 AUDIO\n\t\tTITLE "Song One"\n\t\tFILE "C:/Music/one.mp3" WAVE\n\t\tINDEX 01 00:00:00\n\tTRACK 02 AUDIO\n\t\tTITLE "Song Two"\n\t\tINDEX 01 00:42:23\n`
    const r = parseCue(cue)
    expect(r.map((e) => e.title)).toEqual(['Song One', 'Song Two'])
    expect(r[1].start).toBe(42 * 60 + 23)
  })
  it('parses rekordbox utf-16 txt exports', () => {
    const txt = '#\tArtwork\tTrack Title\tArtist\tBPM\n1\t\tStrobe\tdeadmau5\t128.00\n2\t\tOpus\tEric Prydz\t126.00\n'
    const buf = new Uint8Array([0xff, 0xfe, ...new Uint8Array(Buffer.from(txt, 'utf16le'))])
    const r = parseRekordboxTxt(decodeText(buf))!
    expect(r.map((e) => e.title)).toEqual(['Strobe', 'Opus'])
    expect(r[1].artist).toBe('Eric Prydz')
    const tracks = entriesToTracks(r, 600)
    expect(tracks.map((t) => [t.start, t.deck])).toEqual([[0, 'A'], [300, 'B']])
  })
  it('parses pasted tracklists', () => {
    const r = parsePlainList('00:00 Artist A - Song One\n[1:02:03] Artist B – Song Two (Extended Mix)\n3. Artist C - Song Three (12:30)')
    expect(r[0]).toEqual({ artist: 'Artist A', title: 'Song One', start: 0 })
    expect(r[1]).toEqual({ artist: 'Artist B', title: 'Song Two (Extended Mix)', start: 3723 })
    expect(r[2]).toMatchObject({ artist: 'Artist C', title: 'Song Three', start: 750 })
  })
})

describe('time helpers', () => {
  it('round-trips', () => {
    expect(parseTime('1:02:03')).toBe(3723)
    expect(formatTime(3723)).toBe('1:02:03')
    expect(formatTime(65)).toBe('1:05')
    expect(parseTime('abc')).toBeNaN()
  })
})

describe('mergeHits', () => {
  it('collapses repeated hits and ignores short blips', () => {
    const h = (at: number, title: string) => ({ at, title, artist: 'X' })
    const r = mergeHits([h(0, 'A'), h(45, 'A'), h(90, 'B'), h(135, 'A'), h(180, 'C'), h(225, 'C')])
    expect(r.map((g) => [g.title, g.at])).toEqual([['A', 0], ['C', 180]])
  })
})

describe('card layout', () => {
  const tracks: Track[] = [
    { id: '1', title: 'one', artist: '', start: 0, deck: 'A' },
    { id: '2', title: 'two', artist: '', start: 100, deck: 'B' }
  ]
  const s = { defaultLead: 30, swapDuration: 2 }
  it('shows only the main track before the mix', () => {
    expect(cardStates(tracks, 50, s).map((c) => c.track.id)).toEqual(['1'])
  })
  it('shows the next track on the right during the mix', () => {
    const c = cardStates(tracks, 80, s)
    expect(c.find((x) => x.track.id === '2')).toMatchObject({ slot: 1, mainness: 0 })
    expect(c.find((x) => x.track.id === '1')).toMatchObject({ slot: 0, mainness: 1 })
  })
  it('swaps smoothly', () => {
    const c = cardStates(tracks, 101, s)
    const two = c.find((x) => x.track.id === '2')!
    expect(two.slot).toBeGreaterThan(0)
    expect(two.slot).toBeLessThan(1)
    expect(cardStates(tracks, 103, s).map((x) => x.track.id)).toEqual(['2'])
  })
})

describe('takeover detection', () => {
  it('finds a step up', () => {
    const v = [...Array(20).fill(0.3), ...Array(20).fill(0.8)]
    expect(stepUp(v, 8)).toMatchObject({ at: 20 })
    expect(stepUp(v, 8)!.contrast).toBeCloseTo(0.5)
  })

  it('places the swap where the mix starts sounding like the incoming track', () => {
    // Two "tracks" with different spectra; the second is cued at 60s but only takes over at 100s.
    const fps = 4
    const A = new Float32Array([1, -1, 1, -1])
    const B = new Float32Array([-1, 1, -1, 1])
    const frames = Array.from({ length: 300 * fps }, (_, i) => (i / fps < 100 ? A : B))
    const [first, second] = detectTakeovers({ fps, frames }, [0, 60], 300)
    expect(first).toBe(0)
    expect(second).toBeGreaterThanOrEqual(98)
    expect(second).toBeLessThanOrEqual(102)
  })

  it('falls back to a fixed delay when nothing changes', () => {
    const frames = Array.from({ length: 300 * 4 }, () => new Float32Array([1, -1, 1, -1]))
    expect(detectTakeovers({ fps: 4, frames }, [0, 60], 300)[1]).toBe(60 + FALLBACK_TAKEOVER)
  })

  it('keeps the cue as the mix-in time for DJ cue sheets', async () => {
    const entries = [
      { title: 'One', artist: '', start: 0, startIsDeckStart: true },
      { title: 'Two', artist: '', start: 60, startIsDeckStart: true }
    ]
    const r = await placeTakeovers(entries, async () => [0, 95])
    expect(r[1]).toMatchObject({ start: 95, mixIn: 60 })
    expect(entriesToTracks(r, 300)[1]).toMatchObject({ start: 95, mixIn: 60 })
  })
})
