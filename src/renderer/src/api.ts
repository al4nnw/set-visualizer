import type { Api } from '../../preload'

declare global {
  interface Window {
    api: Api
  }
}

export const api = window.api

/** URL the renderer can load a local file from (served by the main process). */
export const mediaUrl = (path: string) => `media://file/${encodeURIComponent(path)}`

/** Strips Electron's "Error invoking remote method 'x': Error:" prefix. */
export const errMsg = (e: unknown) => String((e as Error)?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
