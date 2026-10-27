import type { IdentifyHit } from '@shared/types'
import { runFfmpeg } from './ffmpeg'

export interface IdentifyOptions {
  audioPath: string
  duration: number
  token: string
  /** Seconds between samples. */
  interval: number
  /** Length of each sample sent to the service. */
  sampleLength?: number
  concurrency?: number
  signal?: AbortSignal
  onHit?: (hit: IdentifyHit) => void
  onProgress?: (done: number, total: number) => void
}

interface AuddResult {
  artist: string
  title: string
  song_link?: string
  apple_music?: { artwork?: { url?: string }; url?: string }
  spotify?: { album?: { images?: { url: string }[] }; external_urls?: { spotify?: string } }
  deezer?: { album?: { cover_xl?: string } }
}

function artworkOf(r: AuddResult): string | undefined {
  const apple = r.apple_music?.artwork?.url
  if (apple) return apple.replace('{w}', '1000').replace('{h}', '1000')
  return r.spotify?.album?.images?.[0]?.url ?? r.deezer?.album?.cover_xl
}

/** Sends one short clip to AudD (https://audd.io). Returns null when nothing matched. */
export async function identifyClip(audioPath: string, at: number, length: number, token: string, signal?: AbortSignal) {
  const clip = await runFfmpeg(
    ['-ss', String(at), '-t', String(length), '-i', audioPath, '-vn', '-ac', '1', '-ar', '44100', '-b:a', '128k', '-f', 'mp3', '-'],
    signal
  )
  const form = new FormData()
  form.append('api_token', token)
  form.append('return', 'apple_music,spotify,deezer')
  form.append('file', new Blob([new Uint8Array(clip)], { type: 'audio/mpeg' }), 'clip.mp3')
  const res = await fetch('https://api.audd.io/', { method: 'POST', body: form, signal })
  if (!res.ok) throw new Error(`AudD HTTP ${res.status}`)
  const json = (await res.json()) as { status: string; result: AuddResult | null; error?: { error_message?: string } }
  if (json.status !== 'success') throw new Error(`AudD: ${json.error?.error_message ?? 'request failed'}`)
  if (!json.result) return null
  const r = json.result
  return { at, title: r.title, artist: r.artist, artwork: artworkOf(r), url: r.song_link } satisfies IdentifyHit
}

/** Samples the whole set every `interval` seconds and reports every match as it comes in. */
export async function identifySet(o: IdentifyOptions): Promise<IdentifyHit[]> {
  const len = o.sampleLength ?? 12
  const times: number[] = []
  for (let t = Math.min(10, o.duration / 2); t + len <= o.duration; t += o.interval) times.push(t)
  const hits: IdentifyHit[] = []
  let next = 0
  let done = 0
  let fatal: Error | null = null
  const worker = async () => {
    while (next < times.length && !fatal && !o.signal?.aborted) {
      const at = times[next++]
      try {
        const hit = await identifyClip(o.audioPath, at, len, o.token, o.signal)
        if (hit) {
          hits.push(hit)
          o.onHit?.(hit)
        }
      } catch (e) {
        if (o.signal?.aborted) return
        const msg = (e as Error).message
        // Bad token or out of credits: stop instead of failing every remaining request.
        if (/api_token|limit|subscription|authorization|#900|#901|#902/i.test(msg)) fatal = e as Error
      }
      o.onProgress?.(++done, times.length)
    }
  }
  await Promise.all(Array.from({ length: o.concurrency ?? 3 }, worker))
  if (fatal) throw fatal
  return hits.sort((a, b) => a.at - b.at)
}
