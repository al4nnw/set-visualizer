import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Browser full screen for one element (the Program viewer). `on` follows the browser, so it also
 * turns off when the user leaves full screen with Esc or the browser's own controls.
 */
export function useFullscreen<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [on, setOn] = useState(false)

  useEffect(() => {
    const sync = () => setOn(!!document.fullscreenElement && document.fullscreenElement === ref.current)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])

  const exit = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
  }, [])

  const toggle = useCallback(() => {
    if (document.fullscreenElement) return exit()
    void ref.current?.requestFullscreen().catch(() => {})
  }, [exit])

  return { ref, on, toggle, exit, available: typeof document !== 'undefined' && !!document.fullscreenEnabled }
}
