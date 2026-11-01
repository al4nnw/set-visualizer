import type { SearchResult } from './types'
import { sameSong } from './tracklist'

type Provider = SearchResult['provider']

export const PROVIDER_NAME: Record<Provider, string> = { youtube: 'YouTube', soundcloud: 'SoundCloud', itunes: 'Apple Music', deezer: 'Deezer' }

/** Where tracks without artwork get it from, in order: Deezer's covers are the sharpest, YouTube is the last resort. */
export const AUTO_ART_ORDER: Provider[] = ['deezer', 'itunes', 'youtube']

/**
 * A title or artist as a search engine wants it. Cue sheets and file names often start with the
 * track's number ("22 - GIØ - SISTEM ERROR", "07. Song") or end with the file's extension, and
 * Deezer finds nothing when they're left in. Numbers that are part of a name ("99 Problems",
 * "2024 - Song") stay.
 */
export function cleanForSearch(s: string): string {
  const out = s
    .replace(/\.(mp3|wav|flac|aiff?|m4a|aac|ogg|opus)\s*$/i, '')
    .replace(/^\s*\d{1,3}\s*[-–—.)_:]\s*/, '')
    .trim()
  return out || s.trim()
}

/** The text to search for a track: "Artist - Title", cleaned, or just the title when there is no artist. */
export function searchQuery(artist: string, title: string): string {
  return [cleanForSearch(artist), cleanForSearch(title)].filter(Boolean).join(' - ')
}

/**
 * The first source in `order` with a result for this song: its result that is the same song, or else
 * its first. A source that fails counts as having found nothing.
 */
export async function findArtwork(
  search: (provider: Provider, q: string) => Promise<SearchResult[]>,
  artist: string,
  title: string,
  order: Provider[] = AUTO_ART_ORDER
): Promise<SearchResult | null> {
  artist = cleanForSearch(artist)
  title = cleanForSearch(title)
  const q = [artist, title].filter(Boolean).join(' ')
  for (const provider of order) {
    const results = (await search(provider, q).catch(() => [])).filter((r) => r.image)
    const best = results.find((r) => sameSong(r, { artist, title })) ?? results[0]
    if (best) return best
  }
  return null
}
