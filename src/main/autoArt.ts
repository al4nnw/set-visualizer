import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PROVIDER_NAME, findArtwork } from '@shared/artwork'
import { downloadArt } from './art'
import { search } from './search'

export interface AutoArt {
  artwork: string
  url: string
  /** Where it came from, like "Deezer". */
  source: string
}

/** Lowercased "artist - title" without bracketed bits, so small spelling differences share an entry. */
const keyOf = (artist: string, title: string) =>
  `${artist} - ${title}`
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/**
 * Finds a track's artwork on Deezer, else Apple Music, else YouTube, remembering every song it has looked up in `deezer-index.json` inside
 * `dir` (next to the downloaded images), so a song that's been seen before is never looked up again.
 */
export function createAutoArt(dir: string) {
  const indexPath = join(dir, 'deezer-index.json')
  let index: Record<string, AutoArt> | null = null
  let saving = Promise.resolve()

  const load = async () => {
    if (index) return index
    try {
      index = JSON.parse(await readFile(indexPath, 'utf8')) as Record<string, AutoArt>
    } catch {
      index = {}
    }
    return index
  }

  const save = () => {
    saving = saving.then(async () => {
      await mkdir(dir, { recursive: true })
      await writeFile(indexPath, JSON.stringify(index, null, 1))
    })
    return saving
  }

  return async function autoArt(artist: string, title: string): Promise<AutoArt | null> {
    const idx = await load()
    const key = keyOf(artist, title)
    const hit = idx[key]
    if (hit && existsSync(hit.artwork)) return hit
    const best = await findArtwork(search, artist, title)
    if (!best) return null
    const found = { artwork: await downloadArt(best.image, dir), url: best.url, source: PROVIDER_NAME[best.provider] }
    idx[key] = found
    await save()
    return found
  }
}
