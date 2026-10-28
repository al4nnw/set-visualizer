import { describe, expect, it } from 'vitest'
import { parseCue, parsePlainList, parseRekordboxTxt, decodeText, mergeHits, entriesToTracks, placeTakeovers, dropRepeatedLoads } from '../src/shared/tracklist'
import { detectTakeovers, measureBlend, settledAt, stepUp, FALLBACK_TAIL, FALLBACK_TAKEOVER } from '../src/shared/takeover'
import { alternateDecks, mainTracks } from '../src/shared/layout'
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
    expect(first!.start).toBe(0)
    expect(second!.start).toBeGreaterThanOrEqual(98)
    expect(second!.start).toBeLessThanOrEqual(102)
  })

  it('falls back to a fixed delay when nothing changes', () => {
    const frames = Array.from({ length: 300 * 4 }, () => new Float32Array([1, -1, 1, -1]))
    expect(detectTakeovers({ fps: 4, frames }, [0, 60], 300)[1]).toEqual({ start: 60 + FALLBACK_TAKEOVER, audibleAt: 60, tailEnd: 60 + FALLBACK_TAKEOVER + FALLBACK_TAIL })
  })

  it('keeps the cue as the mix-in time for DJ cue sheets', async () => {
    const entries = [
      { title: 'One', artist: '', start: 0, startIsDeckStart: true },
      { title: 'Two', artist: '', start: 60, startIsDeckStart: true }
    ]
    const r = await placeTakeovers(entries, async () => [{ start: 0, audibleAt: 0, tailEnd: 0 }, { start: 95, audibleAt: 80, tailEnd: 110 }])
    expect(r[1]).toMatchObject({ start: 95, mixIn: 80 })
    expect(r[0]).toMatchObject({ tailEnd: 110 })
    expect(entriesToTracks(r, 300)[1]).toMatchObject({ start: 95, mixIn: 80 })
  })

  it('marks a track that never takes over as layered', () => {
    // Track 2 is cued at 60s but only layered under track 1 until track 3 takes over at 150s.
    const fps = 4
    const A = new Float32Array([1, -1, 1, -1, 0, 0])
    const C = new Float32Array([0, 0, -1, 1, -1, 1])
    const frames = Array.from({ length: 300 * fps }, (_, i) => (i / fps < 150 ? A : C))
    const r = detectTakeovers({ fps, frames }, [0, 60, 120], 300)
    expect(r[1]).toBeNull()
    expect(r[2]!.start).toBeGreaterThanOrEqual(148)
    expect(r[2]!.start).toBeLessThanOrEqual(152)
  })

  it('keeps layered tracks out of the main sequence', async () => {
    const entries = [0, 60, 120].map((start, i) => ({ title: `T${i}`, artist: '', start, startIsDeckStart: true }))
    const tracks = alternateDecks(entriesToTracks(await placeTakeovers(entries, async () => [{ start: 0, audibleAt: 0, tailEnd: 0 }, null, { start: 150, audibleAt: 150, tailEnd: 150 }]), 300))
    expect(tracks.find((t) => t.title === 'T1')).toMatchObject({ layered: true, start: 60, deck: 'B' })
    expect(mainTracks(tracks).map((t) => [t.title, t.deck])).toEqual([
      ['T0', 'A'],
      ['T2', 'B']
    ])
  })

  it('drops entries for a song that is still on one of the two decks', () => {
    const e = (title: string, start: number) => ({ title, artist: 'x', start })
    const r = dropRepeatedLoads([e('Caravan', 241), e('800 Lesbians', 123), e('800 Lesbians', 480), e('Bad Boy', 510), e('Caravan', 622), e('Beep', 673), e('Caravan', 900)])
    expect(r.map((x) => `${x.title}@${x.start}`)).toEqual(['Caravan@241', '800 Lesbians@123', 'Bad Boy@510', 'Beep@673', 'Caravan@900'])
  })

  it('puts the swap at the end of a slow crossfade', () => {
    // Flat, then a 30-sample ramp from 0.3 to 0.8, then flat.
    const v = [...Array(40).fill(0.3), ...Array.from({ length: 30 }, (_, i) => 0.3 + (0.5 * i) / 30), ...Array(40).fill(0.8)]
    const step = stepUp(v, 8)!
    expect(step.at).toBeLessThan(60)
    expect(settledAt(v, step)).toBeGreaterThanOrEqual(62)
  })

  it('keeps the old track on the right as now playing while it plays under the new one', () => {
    const settings = { defaultLead: 45, swapDuration: 1 }
    const tracks: Track[] = [
      { id: 'a', title: 'A', artist: '', start: 0, deck: 'A', tailEnd: 130 },
      { id: 'b', title: 'B', artist: '', start: 100, mixIn: 80, deck: 'B' }
    ]
    const at = (t: number) => cardStates(tracks, t, settings).map((c) => `${c.track.id}:${c.role}:${c.slot.toFixed(1)}:${c.playing}`)
    expect(at(70)).toEqual(['a:main:0.0:true'])
    expect(at(90)).toEqual(['a:main:0.0:true', 'b:incoming:1.0:true'])
    expect(at(120)).toEqual(['a:tail:1.0:true', 'b:main:0.0:true'])
    expect(at(140)).toEqual(['b:main:0.0:true'])
  })

  it('measures when the incoming track is heard and when the outgoing one is gone', () => {
    // Power spectra: A alone until 100s, A + B from 100s to 160s, B alone after. B's deck starts at 80s.
    const fps = 4
    const A = new Float32Array([4, 1, 0.2, 0.1])
    const B = new Float32Array([0.2, 0.3, 3, 2])
    const power = Array.from({ length: 400 * fps }, (_, i) => {
      const t = i / fps
      const a = t < 160 ? 1 : 0
      const b = t >= 100 ? 1 : 0
      return A.map((v, k) => a * v + b * B[k] + 0.01)
    })
    const r = measureBlend({ fps, frames: [], power }, { cue: 80, start: 130, next: 300, outgoingFrom: 0 })
    expect(r.audible).toBeGreaterThanOrEqual(96)
    expect(r.audible).toBeLessThanOrEqual(104)
    expect(r.gone).toBeGreaterThanOrEqual(156)
    expect(r.gone).toBeLessThanOrEqual(164)
  })
})
