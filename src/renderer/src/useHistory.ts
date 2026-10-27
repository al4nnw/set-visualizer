import { useCallback, useRef, useState } from 'react'

/**
 * State with undo/redo. `set(fn, { merge: true })` folds rapid edits (typing, dragging)
 * into the previous undo step.
 */
export function useHistory<T>(initial: T) {
  const [state, setState] = useState(initial)
  const past = useRef<T[]>([])
  const future = useRef<T[]>([])
  const lastMerge = useRef<{ key: string; at: number } | null>(null)

  const set = useCallback((fn: (prev: T) => T, opts: { mergeKey?: string; skipHistory?: boolean } = {}) => {
    setState((prev) => {
      const next = fn(prev)
      if (next === prev) return prev
      if (!opts.skipHistory) {
        const now = Date.now()
        const merge = opts.mergeKey && lastMerge.current?.key === opts.mergeKey && now - lastMerge.current.at < 1500
        if (!merge) {
          past.current.push(prev)
          if (past.current.length > 200) past.current.shift()
        }
        lastMerge.current = opts.mergeKey ? { key: opts.mergeKey, at: now } : null
        future.current = []
      }
      return next
    })
  }, [])

  const reset = useCallback((value: T) => {
    past.current = []
    future.current = []
    setState(value)
  }, [])

  const undo = useCallback(() => {
    setState((cur) => {
      const prev = past.current.pop()
      if (prev === undefined) return cur
      future.current.push(cur)
      lastMerge.current = null
      return prev
    })
  }, [])

  const redo = useCallback(() => {
    setState((cur) => {
      const next = future.current.pop()
      if (next === undefined) return cur
      past.current.push(cur)
      return next
    })
  }, [])

  return { state, set, reset, undo, redo }
}
