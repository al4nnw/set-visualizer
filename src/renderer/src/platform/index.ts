import { electronPlatform } from './electron'
import type { Platform } from './types'

export type { FileRef, Platform, PlatformFeatures } from './types'

/** The shell this UI runs in. Only the desktop app exists so far. */
export const platform: Platform = electronPlatform(window.api)

/** Strips Electron's "Error invoking remote method 'x': Error:" prefix. */
export const errMsg = (e: unknown) => String((e as Error)?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
