import type { Platform } from './types'
import { webPlatform } from './web'

export { needsFile, type FileRef, type NeedsFile, type Platform } from './types'

/** The browser the UI runs in. */
export const platform: Platform = webPlatform()

export const errMsg = (e: unknown) => String((e as Error)?.message ?? e)
