import type { Api } from '../../../preload'
import type { Platform } from './types'

declare global {
  interface Window {
    api: Api
  }
}

const os = (p: string): Platform['os'] => (p === 'darwin' || p === 'win32' || p === 'linux' ? p : 'other')

/** The desktop app: the preload bridge (window.api) over Electron IPC; files are absolute paths. */
export function electronPlatform(api: Api): Platform {
  return {
    ...api,
    kind: 'desktop',
    os: os(api.platform),
    features: { reveal: true, projectsFolder: true, windowControls: true, tutorial: true },
    // Served by the main process's media:// protocol.
    mediaUrl: (path) => `media://file/${encodeURIComponent(path)}`,
    refForFile: (f) => api.pathForFile(f),
    toggleDevTools: () => void api.toggleDevTools(),
    toggleFullScreen: () => void api.toggleFullScreen(),
    reveal: (path) => void api.reveal(path),
    openExternal: (url) => void api.openExternal(url),
    quit: () => void api.quit()
  }
}
