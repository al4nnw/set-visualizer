import type { SearchResult } from '@shared/types'
import { isoDuration, smallerThumbnail, splitYoutubeTitle, youtubeId, youtubePreview, youtubeThumbnail, youtubeUrl } from '@shared/youtube'
import { i18n } from '../i18n'

/**
 * Artwork in the browser, all of it from the user's own machine: YouTube thumbnails come straight
 * from i.ytimg.com, and searching uses the YouTube Data API with a browser key (set
 * VITE_YOUTUBE_API_KEY at build time, referrer-restricted). The key's daily quota is shared by
 * everyone, so searches only run when the user asks for one; a pasted link costs nothing.
 */

const API = 'https://www.googleapis.com/youtube/v3'
const apiKey = (): string | undefined => import.meta.env.VITE_YOUTUBE_API_KEY || undefined

interface ApiVideo {
  id: string | { videoId?: string }
  snippet?: { title: string; channelTitle: string }
  contentDetails?: { duration?: string }
}

async function api<T>(path: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`${API}/${path}?${new URLSearchParams({ ...params, key: apiKey()! })}`)
  if (!res.ok) {
    const reason = ((await res.json().catch(() => null)) as { error?: { errors?: { reason?: string }[] } } | null)?.error?.errors?.[0]?.reason
    if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') throw new Error(i18n.t('web.youtubeQuota'))
    throw new Error(`YouTube HTTP ${res.status}${reason ? ` (${reason})` : ''}`)
  }
  return (await res.json()) as T
}

/** The API's titles are HTML-escaped ("Don&#39;t"). */
function unescape(s: string): string {
  const el = document.createElement('textarea')
  el.innerHTML = s
  return el.value
}

const result = (id: string, v?: ApiVideo): SearchResult => {
  const { artist, title } = v?.snippet ? splitYoutubeTitle(unescape(v.snippet.title), unescape(v.snippet.channelTitle)) : { artist: '', title: '' }
  return { provider: 'youtube', id, title, artist, url: youtubeUrl(id), image: youtubeThumbnail(id), thumbnail: youtubePreview(id), durationSec: isoDuration(v?.contentDetails?.duration) }
}

/** Title, channel and length of these videos: 1 quota unit for up to 50. */
async function videos(ids: string[]): Promise<Map<string, ApiVideo>> {
  const r = await api<{ items: ApiVideo[] }>('videos', { part: 'snippet,contentDetails', id: ids.join(',') })
  return new Map(r.items.map((v) => [v.id as string, v]))
}

export async function searchYoutube(q: string): Promise<SearchResult[]> {
  const linked = youtubeId(q)
  if (linked) {
    // A link needs no search. With a key, one cheap lookup fills in the title too.
    const info = apiKey() ? await videos([linked]).catch(() => undefined) : undefined
    return [result(linked, info?.get(linked))]
  }
  if (!apiKey()) throw new Error(i18n.t('web.youtubeNoKey'))
  // search.list costs 100 units; the details lookup 1.
  const r = await api<{ items: ApiVideo[] }>('search', { part: 'id', type: 'video', maxResults: '15', q })
  const ids = r.items.map((v) => (typeof v.id === 'string' ? v.id : v.id.videoId)).filter((id): id is string => !!id)
  if (!ids.length) return []
  const info = await videos(ids).catch(() => new Map<string, ApiVideo>())
  return ids.map((id) => result(id, info.get(id)))
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
