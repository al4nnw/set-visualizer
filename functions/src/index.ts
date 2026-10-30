import { defineSecret } from 'firebase-functions/params'
import { HttpsError, onCall } from 'firebase-functions/v2/https'

/**
 * YouTube search for the web version. The Data API key stays here, in Secret Manager, and only
 * signed-in users can call it, so the key's daily quota (10,000 units, 100 per search) isn't open
 * to anyone who finds it. Nothing is stored: the API's answer is trimmed and passed on.
 */

const YOUTUBE_API_KEY = defineSecret('YOUTUBE_API_KEY')
const API = 'https://www.googleapis.com/youtube/v3'

export interface Video {
  id: string
  title: string
  channel: string
  /** ISO 8601, like "PT3M12S". */
  duration?: string
}

interface ApiVideo {
  id: string | { videoId?: string }
  snippet?: { title: string; channelTitle: string }
  contentDetails?: { duration?: string }
}

async function api<T>(path: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`${API}/${path}?${new URLSearchParams({ ...params, key: YOUTUBE_API_KEY.value() })}`)
  if (!res.ok) {
    const reason = ((await res.json().catch(() => null)) as { error?: { errors?: { reason?: string }[] } } | null)?.error?.errors?.[0]?.reason
    if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') throw new HttpsError('resource-exhausted', 'quota')
    throw new HttpsError('unavailable', `YouTube HTTP ${res.status}${reason ? ` (${reason})` : ''}`)
  }
  return (await res.json()) as T
}

/** Title, channel and length of these videos: 1 quota unit for up to 50. */
async function videos(ids: string[]): Promise<Video[]> {
  const r = await api<{ items: ApiVideo[] }>('videos', { part: 'snippet,contentDetails', id: ids.join(',') })
  const byId = new Map(r.items.map((v) => [v.id as string, v]))
  return ids.map((id) => {
    const v = byId.get(id)
    return { id, title: v?.snippet?.title ?? '', channel: v?.snippet?.channelTitle ?? '', duration: v?.contentDetails?.duration }
  })
}

/** `{ q }` searches (101 units); `{ ids }` only looks videos up (1 unit), for pasted links. */
export const youtubeSearch = onCall({ region: 'southamerica-east1', secrets: [YOUTUBE_API_KEY], maxInstances: 5 }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in to search YouTube')
  const { q, ids } = (req.data ?? {}) as { q?: unknown; ids?: unknown }
  if (Array.isArray(ids)) {
    const valid = ids.filter((id): id is string => typeof id === 'string' && /^[\w-]{11}$/.test(id)).slice(0, 50)
    return { videos: valid.length ? await videos(valid) : [] }
  }
  if (typeof q !== 'string' || !q.trim() || q.length > 200) throw new HttpsError('invalid-argument', 'Give a search of 1 to 200 characters')
  const r = await api<{ items: ApiVideo[] }>('search', { part: 'id', type: 'video', maxResults: '15', q: q.trim() })
  const found = r.items.map((v) => (typeof v.id === 'string' ? v.id : v.id.videoId)).filter((id): id is string => !!id)
  return { videos: found.length ? await videos(found) : [] }
})
