import type { ArtAsset, CanvasFactory, ImageLike } from '@shared/scene'
import { makeBlurred } from '@shared/scene'
import type { Project } from '@shared/types'
import { platform } from './platform'

export const offscreenFactory: CanvasFactory = (w, h) => new OffscreenCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)))

const cache = new Map<string, Promise<ArtAsset | null>>()

/** Loads (and caches by path) every track's artwork plus its blurred background version. */
export async function loadArtMap(project: Project): Promise<Map<string, ArtAsset>> {
  const out = new Map<string, ArtAsset>()
  await Promise.all(
    project.tracks.map(async (t) => {
      if (!t.artwork) return
      let p = cache.get(t.artwork)
      if (!p) {
        p = (async () => {
          try {
            const blob = await (await fetch(platform.mediaUrl(t.artwork!))).blob()
            const image = (await createImageBitmap(blob)) as unknown as ImageLike
            return { image, blurred: makeBlurred(image, offscreenFactory) }
          } catch {
            return null
          }
        })()
        cache.set(t.artwork, p)
      }
      const a = await p
      if (a) out.set(t.id, a)
    })
  )
  return out
}

/** Registers the scene font in a window or worker scope. */
export async function loadSceneFonts(fonts: Array<{ weight: string; url: string }>) {
  const set = (self as unknown as { fonts: FontFaceSet }).fonts
  await Promise.all(
    fonts.map(async (f) => {
      const face = new FontFace('Inter', `url(${f.url})`, { weight: f.weight })
      await face.load()
      set.add(face)
    })
  )
}
