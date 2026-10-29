import { electronPlatform } from './electron'
import type { Platform } from './types'
import { webPlatform } from './web'

export type { FileRef, Platform, PlatformFeatures } from './types'

/** The shell this UI runs in: the desktop app (its preload bridge), or else a browser. */
export const platform: Platform = window.api ? electronPlatform(window.api) : webPlatform()

/** Strips Electron's "Error invoking remote method 'x': Error:" prefix. */
export const errMsg = (e: unknown) => String((e as Error)?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
