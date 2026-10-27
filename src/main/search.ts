import yts from 'yt-search'
import type { SearchResult } from '@shared/types'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } })
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`)
  return (await res.json()) as T
}

/** Splits "Artist - Title (Official Video)" style YouTube titles. */
function splitYoutubeTitle(title: string, channel: string) {
  const clean = title.replace(/\s*[[(](official|lyric|audio|video|visuali[sz]er|hd|4k)[^\])]*[\])]/gi, '').trim()
  const m = /^(.*?)\s+[-–—]\s+(.*)$/.exec(clean)
  if (m) return { artist: m[1].trim(), title: m[2].trim() }
  return { artist: channel.replace(/\s*-\s*Topic$/, ''), title: clean }
}

async function searchYoutube(q: string): Promise<SearchResult[]> {
  const r = await yts({ query: q, pages: 1 })
  return r.videos.slice(0, 15).map((v) => {
    const { artist, title } = splitYoutubeTitle(v.title, v.author?.name ?? '')
    return {
      provider: 'youtube',
      id: v.videoId,
      title,
      artist,
      url: v.url,
      image: `https://i.ytimg.com/vi/${v.videoId}/maxresdefault.jpg`,
      thumbnail: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
      durationSec: v.seconds
    }
  })
}

let scClientId: string | null = null

/** SoundCloud's public web client id, scraped from its JS bundle (no API key needed). */
async function soundcloudClientId(): Promise<string> {
  if (scClientId) return scClientId
  const html = await (await fetch('https://soundcloud.com/', { headers: { 'user-agent': UA } })).text()
  const scripts = [...html.matchAll(/<script[^>]+src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g)].map((m) => m[1])
  for (const src of scripts.reverse()) {
    const js = await (await fetch(src, { headers: { 'user-agent': UA } })).text()
    const m = /client_id\s*[:=]\s*"([a-zA-Z0-9]{32})"/.exec(js) ?? /[?&]client_id=([a-zA-Z0-9]{32})/.exec(js)
    if (m) return (scClientId = m[1])
  }
  throw new Error('Could not get a SoundCloud client id')
}

interface ScTrack {
  id: number
  title: string
  permalink_url: string
  artwork_url: string | null
  duration: number
  user: { username: string; avatar_url?: string }
  publisher_metadata?: { artist?: string }
}

async function searchSoundcloud(q: string, retry = true): Promise<SearchResult[]> {
  const id = await soundcloudClientId()
  const res = await fetch(`https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(q)}&client_id=${id}&limit=15`, {
    headers: { 'user-agent': UA }
  })
  if ((res.status === 401 || res.status === 403) && retry) {
    scClientId = null
    return searchSoundcloud(q, false)
  }
  if (!res.ok) throw new Error(`SoundCloud HTTP ${res.status}`)
  const json = (await res.json()) as { collection: ScTrack[] }
  return json.collection.map((t) => {
    const art = t.artwork_url ?? t.user.avatar_url ?? ''
    return {
      provider: 'soundcloud',
      id: String(t.id),
      title: t.title,
      artist: t.publisher_metadata?.artist || t.user.username,
      url: t.permalink_url,
      image: art.replace('-large', '-t500x500'),
      thumbnail: art,
      durationSec: Math.round(t.duration / 1000)
    }
  })
}

async function searchItunes(q: string): Promise<SearchResult[]> {
  const json = await getJson<{
    results: { trackId: number; trackName: string; artistName: string; artworkUrl100: string; trackViewUrl: string; trackTimeMillis?: number }[]
  }>(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=15`)
  return json.results.map((r) => ({
    provider: 'itunes',
    id: String(r.trackId),
    title: r.trackName,
    artist: r.artistName,
    url: r.trackViewUrl,
    image: r.artworkUrl100.replace(/\/\d+x\d+bb\./, '/1000x1000bb.'),
    thumbnail: r.artworkUrl100,
    durationSec: r.trackTimeMillis ? Math.round(r.trackTimeMillis / 1000) : undefined
  }))
}

async function searchDeezer(q: string): Promise<SearchResult[]> {
  const json = await getJson<{
    data: { id: number; title: string; link: string; duration: number; artist: { name: string }; album: { cover_xl: string; cover_medium: string } }[]
  }>(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=15`)
  return json.data.map((r) => ({
    provider: 'deezer',
    id: String(r.id),
    title: r.title,
    artist: r.artist.name,
    url: r.link,
    image: r.album.cover_xl,
    thumbnail: r.album.cover_medium,
    durationSec: r.duration
  }))
}

const SEARCHERS: Record<SearchResult['provider'], (q: string) => Promise<SearchResult[]>> = {
  youtube: searchYoutube,
  soundcloud: searchSoundcloud,
  itunes: searchItunes,
  deezer: searchDeezer
}

export async function search(provider: SearchResult['provider'], q: string): Promise<SearchResult[]> {
  try {
    return await SEARCHERS[provider](q)
  } catch (e) {
    // Some libraries put the whole request dump in the message; keep the first line.
    const msg = String((e as Error).message ?? e).split(/[\n{]/)[0].trim().slice(0, 160)
    throw new Error(`Couldn't search ${provider === 'itunes' ? 'Apple Music' : provider}: ${msg}`)
  }
}
