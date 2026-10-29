/** YouTube links and thumbnails, shared by the desktop search and the browser's. */

/**
 * The video id in a YouTube link (watch, youtu.be, shorts, embed, live, music.youtube.com), or null
 * when the text isn't one.
 */
export function youtubeId(text: string): string | null {
  const s = text.trim()
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, '')
  let id: string | null = null
  if (host === 'youtu.be') id = url.pathname.split('/')[1] ?? null
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = url.searchParams.get('v') ?? /^\/(?:shorts|embed|live|v)\/([^/?#]+)/.exec(url.pathname)?.[1] ?? null
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null
}

export const youtubeUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`

/** The largest thumbnail. Not every video has one; `smallerThumbnail` gives the fallback. */
export const youtubeThumbnail = (id: string) => `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`
export const youtubePreview = (id: string) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`

/** The fallback for a maxres thumbnail URL, or null when `url` isn't one. */
export const smallerThumbnail = (url: string) => (url.includes('/maxresdefault.') ? url.replace('/maxresdefault.', '/hqdefault.') : null)

/** Splits "Artist - Title (Official Video)" style YouTube titles. */
export function splitYoutubeTitle(title: string, channel: string) {
  const clean = title.replace(/\s*[[(](official|lyric|audio|video|visuali[sz]er|hd|4k)[^\])]*[\])]/gi, '').trim()
  const m = /^(.*?)\s+[-–—]\s+(.*)$/.exec(clean)
  if (m) return { artist: m[1].trim(), title: m[2].trim() }
  return { artist: channel.replace(/\s*-\s*Topic$/, ''), title: clean }
}

/** ISO 8601 durations as the YouTube Data API gives them ("PT1H2M3S") in seconds. */
export function isoDuration(d: string | undefined): number | undefined {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(d ?? '')
  if (!m) return undefined
  return ((+(m[1] ?? 0) * 24 + +(m[2] ?? 0)) * 60 + +(m[3] ?? 0)) * 60 + +(m[4] ?? 0)
}
