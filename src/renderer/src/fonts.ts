import w400 from '@fontsource/inter/files/inter-latin-400-normal.woff2?url'
import w500 from '@fontsource/inter/files/inter-latin-500-normal.woff2?url'
import w600 from '@fontsource/inter/files/inter-latin-600-normal.woff2?url'
import w700 from '@fontsource/inter/files/inter-latin-700-normal.woff2?url'
import w800 from '@fontsource/inter/files/inter-latin-800-normal.woff2?url'

/** Inter weights used by the scene, as absolute URLs (workers need them to load fonts themselves). */
export const SCENE_FONTS: Array<{ weight: string; url: string }> = [
  { weight: '400', url: w400 },
  { weight: '500', url: w500 },
  { weight: '600', url: w600 },
  { weight: '700', url: w700 },
  { weight: '800', url: w800 }
].map((f) => ({ ...f, url: new URL(f.url, location.href).href }))
