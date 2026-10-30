import type { SearchResult } from './types'
import { sameSong } from './tracklist'

type Provider = SearchResult['provider']

export const PROVIDER_NAME: Record<Provider, string> = { youtube: 'YouTube', soundcloud: 'SoundCloud', itunes: 'Apple Music', deezer: 'Deezer' }

/** Where tracks without artwork get it from, in order: Deezer's covers are the sharpest, YouTube is the last resort. */
export const AUTO_ART_ORDER: Provider[] = ['deezer', 'itunes', 'youtube']

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
  const q = [artist, title].filter(Boolean).join(' ')
  for (const provider of order) {
    const results = (await search(provider, q).catch(() => [])).filter((r) => r.image)
    const best = results.find((r) => sameSong(r, { artist, title })) ?? results[0]
    if (best) return best
  }
  return null
}
