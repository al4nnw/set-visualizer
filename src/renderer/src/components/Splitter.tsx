import { useState } from 'react'

/** A number kept in localStorage (panel sizes). Falls back to the default when storage is unavailable. */
export function useStoredNumber(key: string, initial: number) {
  const [v, setV] = useState(() => {
    try {
      const s = localStorage.getItem(key)
      return s !== null && Number.isFinite(+s) ? +s : initial
    } catch {
      return initial
    }
  })
  const set = (n: number) => {
    setV(n)
    try {
      localStorage.setItem(key, String(n))
    } catch {
      // ignore
    }
  }
  return [v, set] as const
}

interface Props {
  dir: 'col' | 'row'
  value: number
  min: number
  max: number
  /** +1 when dragging right/down grows the panel, -1 when it shrinks it. */
  sign: 1 | -1
  onChange: (v: number) => void
  onReset: () => void
}

/** Drag handle between two panels. Double-click resets the size. */
export function Splitter({ dir, value, min, max, sign, onChange, onReset }: Props) {
  const [active, setActive] = useState(false)
  const down = (e: React.PointerEvent) => {
    e.preventDefault()
    const p0 = dir === 'col' ? e.clientX : e.clientY
    const v0 = value
    setActive(true)
    const move = (ev: PointerEvent) => {
      const d = (dir === 'col' ? ev.clientX : ev.clientY) - p0
      onChange(Math.round(Math.max(min, Math.min(max, v0 + sign * d))))
    }
    const up = () => {
      setActive(false)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  return <div className={`splitter ${dir} ${active ? 'active' : ''}`} onPointerDown={down} onDoubleClick={onReset} />
}
