'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

interface SatsContextValue {
  satsMode: boolean
  toggleSatsMode: () => void
}

const SatsContext = createContext<SatsContextValue>({ satsMode: false, toggleSatsMode: () => {} })

const STORAGE_KEY = 'xcpdex-sats-mode'

export function SatsProvider({ children }: { children: ReactNode }) {
  const [satsMode, setSatsMode] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === '1') setSatsMode(true)
    } catch {}
  }, [])

  const toggleSatsMode = () => {
    setSatsMode((prev) => {
      const next = !prev
      try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0') } catch {}
      return next
    })
  }

  return (
    <SatsContext value={{ satsMode, toggleSatsMode }}>
      {children}
    </SatsContext>
  )
}

export function useSatsMode() {
  return useContext(SatsContext)
}
