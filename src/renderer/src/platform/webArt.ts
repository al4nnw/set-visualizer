import type { SearchResult } from '@shared/types'
import { isoDuration, smallerThumbnail, splitYoutubeTitle, youtubeId, youtubePreview, youtubeThumbnail, youtubeUrl } from '@shared/youtube'
import { i18n } from '../i18n'

/**
 * Artwork in the browser. Apple Music and Deezer are searched by the browser itself, and their
 * covers and YouTube's thumbnails are fetched straight from their CDNs. Searching YouTube goes
 * through the site's Firebase function (webFirebase.ts), which keeps the Data API key and needs a
 * Google sign-in. Its daily quota is shared by everyone, so it only runs when the user asks for a
 * search; a pasted link costs next to nothing.
 */

/** The API's titles are HTML-escaped ("Don&#39;t"). */
function unescape(s: string): string {
  const el = document.createElement('textarea')
  el.innerHTML = s
  return el.value
}

interface Video {
  id: string
  title: string
  channel: string
  duration?: string
}

const result = (id: string, v?: Video): SearchResult => {
  const { artist, title } = v?.title ? splitYoutubeTitle(unescape(v.title), unescape(v.channel)) : { artist: '', title: '' }
  return { provider: 'youtube', id, title, artist, url: youtubeUrl(id), image: youtubeThumbnail(id), thumbnail: youtubePreview(id), durationSec: isoDuration(v?.duration) }
}

/** The function's call, loading Firebase (sign-in included) the first time. */
async function callYoutube(data: { q: string } | { ids: string[] }): Promise<Video[]> {
  const { youtubeSearch } = await import('./webFirebase')
  try {
    return await youtubeSearch(data)
  } catch (e) {
    const code = (e as { code?: string }).code ?? ''
    if (code === 'functions/resource-exhausted') throw new Error(i18n.t('web.youtubeQuota'))
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') throw new Error(i18n.t('web.youtubeSignIn'))
    if (code === 'auth/popup-blocked') throw new Error(i18n.t('web.youtubePopup'))
    throw e
  }
}

/** Whether YouTube can be searched without asking anyone to sign in. */
export async function youtubeReady(): Promise<boolean> {
  const { isSignedIn } = await import('./webFirebase')
  return isSignedIn()
}

export async function searchYoutube(q: string): Promise<SearchResult[]> {
  const linked = youtubeId(q)
  if (linked) {
    // A link needs no search. When signed in, one cheap lookup (1 unit) fills in the title too.
    const info = (await youtubeReady()) ? await callYoutube({ ids: [linked] }).catch(() => undefined) : undefined
    return [result(linked, info?.[0])]
  }
  // 101 units: the search, then the found videos' details.
  return (await callYoutube({ q })).map((v) => result(v.id, v))
}

export async function searchItunes(q: string): Promise<SearchResult[]> {
  const res = await fetch(`https://itunes.apple.com/search?${new URLSearchParams({ term: q, entity: 'song', limit: '15' })}`)
  if (!res.ok) throw new Error(`Apple Music HTTP ${res.status}`)
  const json = (await res.json()) as {
    results: { trackId: number; trackName: string; artistName: string; artworkUrl100: string; trackViewUrl: string; trackTimeMillis?: number }[]
  }
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

let jsonpSeq = 0

/** Deezer's API doesn't allow pages on other sites to read it, except as JSONP. */
function jsonp<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const name = `__deezer${++jsonpSeq}`
    const script = document.createElement('script')
    const w = window as unknown as Record<string, unknown>
    const done = () => {
      delete w[name]
      script.remove()
      clearTimeout(timer)
    }
    const timer = setTimeout(() => {
      done()
      reject(new Error('Deezer took too long to answer'))
    }, 15_000)
    w[name] = (data: T) => {
      done()
      resolve(data)
    }
    script.onerror = () => {
      done()
      reject(new Error("Couldn't reach Deezer"))
    }
    script.src = `${url}&output=jsonp&callback=${name}`
    document.head.append(script)
  })
}

export async function searchDeezer(q: string): Promise<SearchResult[]> {
  const json = await jsonp<{
    data?: { id: number; title: string; link: string; duration: number; artist: { name: string }; album: { cover_xl: string; cover_medium: string } }[]
    error?: { message?: string }
  }>(`https://api.deezer.com/search?${new URLSearchParams({ q, limit: '15' })}`)
  if (json.error) throw new Error(`Deezer: ${json.error.message ?? 'error'}`)
  return (json.data ?? []).map((r) => ({
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

async function fetchImage(url: string): Promise<Blob> {
  const res = await fetch(url, { mode: 'cors' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.blob()
}

const MAX_SIDE = 1200

/**
 * The rows and columns of `img` that aren't black bars (YouTube thumbnails are often 4:3 around a
 * 16:9 frame, sometimes letterboxed again inside it), like ffmpeg's cropdetect=limit=0.08.
 */
function contentBox(img: ImageBitmap): { x: number; y: number; w: number; h: number } {
  const sc = Math.min(1, 320 / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * sc))
  const h = Math.max(1, Math.round(img.height * sc))
  const ctx = new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, w, h)
  const px = ctx.getImageData(0, 0, w, h).data
  const limit = 0.08 * 255
  const luma = (i: number) => 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
  const rowDark = (y: number) => {
    let m = 0
    for (let x = 0; x < w; x++) m = Math.max(m, luma((y * w + x) * 4))
    return m <= limit
  }
  const colDark = (x: number, y0: number, y1: number) => {
    let m = 0
    for (let y = y0; y < y1; y++) m = Math.max(m, luma((y * w + x) * 4))
    return m <= limit
  }
  let top = 0
  let bottom = h
  while (top < bottom - 1 && rowDark(top)) top++
  while (bottom - 1 > top && rowDark(bottom - 1)) bottom--
  let left = 0
  let right = w
  while (left < right - 1 && colDark(left, top, bottom)) left++
  while (right - 1 > left && colDark(right - 1, top, bottom)) right--
  // Back to full resolution, a pixel inside any bar found so no dark edge is left from the downscale.
  const x0 = Math.ceil(left > 0 ? (left + 1) / sc : 0)
  const y0 = Math.ceil(top > 0 ? (top + 1) / sc : 0)
  const x1 = Math.floor(right < w ? (right - 1) / sc : img.width)
  const y1 = Math.floor(bottom < h ? (bottom - 1) / sc : img.height)
  const box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
  return box.w > 16 && box.h > 16 ? box : { x: 0, y: 0, w: img.width, h: img.height }
}

/** Any image as a JPEG of at most 1200 px with its black bars trimmed, as the desktop app saves it. */
async function normalise(blob: Blob): Promise<Blob> {
  const img = await createImageBitmap(blob)
  try {
    const box = contentBox(img)
    const sc = Math.min(1, MAX_SIDE / Math.max(box.w, box.h))
    const c = new OffscreenCanvas(Math.round(box.w * sc), Math.round(box.h * sc))
    const ctx = c.getContext('2d')!
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, box.x, box.y, box.w, box.h, 0, 0, c.width, c.height)
    return await c.convertToBlob({ type: 'image/jpeg', quality: 0.9 })
  } finally {
    img.close()
  }
}

/** Downloads artwork (a YouTube link becomes its thumbnail) and returns it as a local image file. */
export async function downloadArtwork(url: string): Promise<File> {
  const linked = youtubeId(url)
  const src = linked ? youtubeThumbnail(linked) : url
  let blob: Blob
  try {
    blob = await fetchImage(src)
  } catch (e) {
    // Not every YouTube video has a maxres thumbnail.
    const smaller = smallerThumbnail(src)
    if (!smaller) throw e
    blob = await fetchImage(smaller)
  }
  const jpg = await normalise(blob)
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-1', await jpg.arrayBuffer()))]
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return new File([jpg], `${hash}.jpg`, { type: 'image/jpeg' })
}
