// The desktop app's renderer, on the browser platform (no Electron preload here). Imported from
// inside src/web so the dev server, which only serves its root's own paths to the page, finds it.
import '../renderer/src/main.tsx'
