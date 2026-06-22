import { useState } from 'react'

export function usePersistentState(key, defaultValue) {
  const [state, setState] = useState(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored ? JSON.parse(stored) : defaultValue
    } catch {
      return defaultValue
    }
  })

  function setPersistentState(updater) {
    setState(prev => {
      const next =
        typeof updater === 'function'
          ? updater(prev)
          : updater

      try {
        localStorage.setItem(key, JSON.stringify(next))
      } catch {}

      return next
    })
  }

  return [state, setPersistentState]
}
