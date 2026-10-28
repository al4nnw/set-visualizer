import { useEffect, useRef, useState, type ReactNode } from 'react'
import { platform } from '../platform'

export type MenuItem =
  | {
      /** Stable command id (the label changes with the UI language). */
      id?: string
      label: string
      /** Key combo like "Mod+Shift+S", "Space" or "ArrowLeft"; Mod is Cmd on macOS, Ctrl elsewhere. */
      shortcut?: string
      /** A second combo, shown next to the first ("A / ←"). */
      altShortcut?: string
      /** More combos that run the same command without being shown. */
      alsoKeys?: string[]
      /** Fires even while a text field has focus. */
      global?: boolean
      run?: () => void
      disabled?: boolean
      checked?: boolean
      submenu?: MenuItem[]
      hint?: string
    }
  | 'sep'

export interface Menu {
  label: string
  items: MenuItem[]
  onOpen?: () => void
}

const isMac = platform.os === 'darwin'

const KEY_NAMES: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
  Delete: 'Del',
  Space: 'Space'
}

export function shortcutLabel(combo: string): string {
  const parts = combo.split('+').filter(Boolean)
  const key = combo.endsWith('++') ? '+' : parts.pop()!
  const mods = parts.map((m) => (m === 'Mod' ? (isMac ? '⌘' : 'Ctrl') : m === 'Shift' ? (isMac ? '⇧' : 'Shift') : m === 'Alt' ? (isMac ? '⌥' : 'Alt') : m))
  const k = KEY_NAMES[key] ?? (key.length === 1 ? key.toUpperCase() : key)
  return isMac ? mods.join('') + k : [...mods, k].join('+')
}

/** The shortcut as shown in menus, with its second combo if it has one. */
export const keysLabel = (it: { shortcut?: string; altShortcut?: string }) => [it.shortcut, it.altShortcut].filter(Boolean).map((c) => shortcutLabel(c!)).join(' / ')

/** Whether a keydown matches a combo such as "Mod+Shift+S". */
export function matches(e: KeyboardEvent, combo: string): boolean {
  const parts = combo.split('+')
  const key = parts.pop()!
  const mod = parts.includes('Mod')
  if (mod !== (isMac ? e.metaKey : e.ctrlKey)) return false
  // Plain keys (A, S, D, arrows...) never fire with Ctrl or Cmd held.
  if (!mod && (e.ctrlKey || e.metaKey)) return false
  // Symbols like "=" may need Shift to type on some layouts, so only letters and named keys are strict.
  const strictShift = key.length > 1 || /[a-z0-9]/i.test(key)
  if (strictShift && parts.includes('Shift') !== e.shiftKey) return false
  if (parts.includes('Alt') !== e.altKey) return false
  if (key === 'Space') return e.code === 'Space'
  if (key.length === 1) return e.key.toLowerCase() === key.toLowerCase() || (key === '=' && e.key === '+')
  return e.key === key
}

export function flatten(menus: Menu[]): Array<Exclude<MenuItem, 'sep'>> {
  const out: Array<Exclude<MenuItem, 'sep'>> = []
  const walk = (items: MenuItem[]) => {
    for (const it of items) {
      if (it === 'sep') continue
      out.push(it)
      if (it.submenu) walk(it.submenu)
    }
  }
  menus.forEach((m) => walk(m.items))
  return out
}

function Items({ items, close }: { items: MenuItem[]; close: () => void }) {
  const [sub, setSub] = useState<number | null>(null)
  return (
    <div className="menu-pop" role="menu">
      {items.map((it, i) =>
        it === 'sep' ? (
          <div key={i} className="menu-sep" />
        ) : (
          <div
            key={i}
            role="menuitem"
            className={`menu-item ${it.disabled ? 'disabled' : ''} ${sub === i ? 'open' : ''}`}
            onMouseEnter={() => setSub(it.submenu ? i : null)}
            onClick={() => {
              if (it.disabled || it.submenu) return
              close()
              it.run?.()
            }}
          >
            <span className="menu-check">{it.checked ? '✓' : ''}</span>
            <span className="menu-label">{it.label}</span>
            {it.hint && <span className="menu-hint">{it.hint}</span>}
            {it.shortcut && <span className="menu-key">{keysLabel(it)}</span>}
            {it.submenu && <span className="menu-arrow">›</span>}
            {it.submenu && sub === i && (
              <div className="menu-sub">
                <Items items={it.submenu} close={close} />
              </div>
            )}
          </div>
        )
      )}
    </div>
  )
}

interface Props {
  menus: Menu[]
  /** Shown in the middle of the bar (project name and save state). */
  center?: ReactNode
  right?: ReactNode
}

/** Desktop-style menu bar: click a menu to open it, then hover to move between menus. */
export function MenuBar({ menus, center, right }: Props) {
  const [open, setOpen] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open === null) return
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(null)
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null)
      else if (e.key === 'ArrowRight') setOpen((o) => (o === null ? o : (o + 1) % menus.length))
      else if (e.key === 'ArrowLeft') setOpen((o) => (o === null ? o : (o + menus.length - 1) % menus.length))
      else return
      e.stopPropagation()
    }
    window.addEventListener('mousedown', down)
    window.addEventListener('keydown', key, true)
    window.addEventListener('blur', () => setOpen(null), { once: true })
    return () => {
      window.removeEventListener('mousedown', down)
      window.removeEventListener('keydown', key, true)
    }
  }, [open, menus.length])

  useEffect(() => {
    if (open !== null) menus[open]?.onOpen?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <div className={`menubar ${isMac ? 'mac' : ''}`} ref={ref}>
      <div className="menubar-logo" title="Set Visualizer">
        <svg viewBox="0 0 16 16" width="14" height="14">
          <path d="M2 9v-2M5 12V4M8 14V2M11 11V5M14 9V7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </div>
      {menus.map((m, i) => (
        <div key={m.label} className="menubar-menu">
          <button
            className={`menubar-btn ${open === i ? 'open' : ''}`}
            onMouseDown={(e) => {
              e.preventDefault()
              setOpen(open === i ? null : i)
            }}
            onMouseEnter={() => open !== null && setOpen(i)}
          >
            {m.label}
          </button>
          {open === i && <Items items={m.items} close={() => setOpen(null)} />}
        </div>
      ))}
      <div className="menubar-center">{center}</div>
      <div className="menubar-right">{right}</div>
    </div>
  )
}
