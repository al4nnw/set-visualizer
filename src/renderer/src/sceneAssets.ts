import type { ArtAsset, CanvasFactory, ImageLike } from '@shared/scene'
import { makeBlurred } from '@shared/scene'
import type { Project } from '@shared/types'

export const offscreenFactory: CanvasFactory = (w, h) => new OffscreenCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)))

/**
 * Canvases drawn by the CPU, in the thread that draws them (`willReadFrequently` keeps a canvas
 * off the GPU, and the context is made here so the scene's later getContext gets this one). The
 * export draws on these: on the GPU, its workers queue behind the editor's preview in the
 * browser's one GPU process and the editor stalls while a video exports.
 */
export const cpuCanvasFactory: CanvasFactory = (w, h) => {
  const c = offscreenFactory(w, h) as unknown as OffscreenCanvas
  c.getContext('2d', { willReadFrequently: true })
  return c as unknown as ReturnType<CanvasFactory>
}

const cache = new Map<string, Promise<ArtAsset | null>>()

/**
 * Loads (and caches by path) every track's artwork plus its blurred background version. `urlFor`
 * turns an artwork ref into a URL (platform.mediaUrl on the page; a worker gets URLs already).
 */
export async function loadArtMap(project: Project, urlFor: (ref: string) => string = (r) => r, factory: CanvasFactory = offscreenFactory): Promise<Map<string, ArtAsset>> {
  const out = new Map<string, ArtAsset>()
  await Promise.all(
    project.tracks.map(async (t) => {
      if (!t.artwork) return
      let p = cache.get(t.artwork)
      if (!p) {
        p = (async () => {
          try {
            const blob = await (await fetch(urlFor(t.artwork!))).blob()
            const image = (await createImageBitmap(blob)) as unknown as ImageLike
            return { image, blurred: makeBlurred(image, factory) }
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
