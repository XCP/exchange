'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useSearch } from '@/lib/hooks/useSearch'
import { XCP_IMG_BASE } from '@/utils/constants'

function formatBtc(val: number | null): string {
  if (val == null || val === 0) return ''
  if (val >= 1) return `${val.toFixed(2)} BTC`
  return `${(val * 1e8).toFixed(0)} sats`
}

export function SearchInput({ mobileOpen = false, onMobileOpenChange }: { mobileOpen?: boolean; onMobileOpenChange?: (open: boolean) => void } = {}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const setMobileOpen = onMobileOpenChange ?? (() => {})
  const inputRef = useRef<HTMLInputElement>(null)
  const mobileInputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const mobileContainerRef = useRef<HTMLDivElement>(null)

  const { data, isLoading } = useSearch(debouncedQuery)
  const pairs = data?.pairs ?? []
  const dispensers = data?.dispensers ?? []
  const totalResults = pairs.length + dispensers.length

  // Debounce query
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(t)
  }, [query])

  // Open dropdown when we have results
  useEffect(() => {
    if (totalResults > 0 && debouncedQuery.length >= 2) {
      setOpen(true)
      setSelectedIndex(-1)
    } else if (debouncedQuery.length < 2) {
      setOpen(false)
    }
  }, [totalResults, debouncedQuery])

  // `/` keyboard shortcut to focus search
  useEffect(() => {
    function handleSlash(e: KeyboardEvent) {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleSlash)
    return () => document.removeEventListener('keydown', handleSlash)
  }, [])

  // Focus mobile input when overlay opens
  useEffect(() => {
    if (mobileOpen) {
      setTimeout(() => mobileInputRef.current?.focus(), 50)
    } else {
      setQuery('')
      setDebouncedQuery('')
    }
  }, [mobileOpen])

  // Click outside to close
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
      if (mobileContainerRef.current && !mobileContainerRef.current.contains(e.target as Node)) {
        setMobileOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const navigate = useCallback((url: string) => {
    setOpen(false)
    setMobileOpen(false)
    setQuery('')
    setDebouncedQuery('')
    router.push(url)
  }, [router])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || totalResults === 0) {
      if (e.key === 'Escape') {
        ;(e.target as HTMLInputElement).blur()
        setOpen(false)
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex((i) => (i + 1) % totalResults)
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex((i) => (i - 1 + totalResults) % totalResults)
        break
      case 'Enter':
        e.preventDefault()
        if (selectedIndex >= 0) {
          if (selectedIndex < pairs.length) {
            const p = pairs[selectedIndex]
            navigate(`/trade/${p.pair.replace('/', '_')}`)
          } else {
            const d = dispensers[selectedIndex - pairs.length]
            navigate(`/dispense/${d.asset}`)
          }
        }
        break
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        ;(e.target as HTMLInputElement).blur()
        break
    }
  }

  const dropdown = (
    <div className="absolute left-0 right-0 top-full mt-1 rounded-sm border border-zinc-700 bg-zinc-900 shadow-lg shadow-black/40 overflow-hidden z-[100]">
      {isLoading && debouncedQuery.length >= 2 && totalResults === 0 && (
        <div className="px-3 py-2 text-xs text-zinc-500">Searching...</div>
      )}
      {!isLoading && debouncedQuery.length >= 2 && totalResults === 0 && (
        <div className="px-3 py-2 text-xs text-zinc-500">No results found</div>
      )}
      {pairs.length > 0 && (
        <div>
          <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
            Pairs
          </div>
          {pairs.map((p, i) => (
            <button
              key={p.pair}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => navigate(`/trade/${p.pair.replace('/', '_')}`)}
              onMouseEnter={() => setSelectedIndex(i)}
              className={`w-full flex items-center justify-between px-3 py-1.5 text-left transition-colors ${
                selectedIndex === i ? 'bg-zinc-800' : 'hover:bg-zinc-800/50'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-5 w-5 rounded-sm bg-zinc-800 overflow-hidden flex items-center justify-center shrink-0">
                  <Image src={`${XCP_IMG_BASE}/icon/${p.base_asset}`} alt="" width={20} height={20} className="object-cover" unoptimized />
                </div>
                <span className="text-xs text-zinc-200 font-medium truncate">
                  {p.base_asset_longname || p.base_asset}
                  <span className="text-zinc-500">/{p.quote_asset}</span>
                </span>
              </div>
              {p.volume_24h != null && p.volume_24h > 0 && (
                <span className="text-[10px] text-zinc-500 ml-2 shrink-0">
                  {formatBtc(p.volume_24h)}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {dispensers.length > 0 && (
        <div>
          <div className={`px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500 border-b border-zinc-800 ${pairs.length > 0 ? 'border-t' : ''}`}>
            Dispensers
          </div>
          {dispensers.map((d, i) => {
            const idx = pairs.length + i
            return (
              <button
                key={d.asset}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => navigate(`/dispense/${d.asset}`)}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`w-full flex items-center justify-between px-3 py-1.5 text-left transition-colors ${
                  selectedIndex === idx ? 'bg-zinc-800' : 'hover:bg-zinc-800/50'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-5 w-5 rounded-sm bg-zinc-800 overflow-hidden flex items-center justify-center shrink-0">
                    <Image src={`${XCP_IMG_BASE}/icon/${d.asset}`} alt="" width={20} height={20} className="object-cover" unoptimized />
                  </div>
                  <span className="text-xs text-zinc-200 font-medium truncate">{d.asset_longname || d.asset}</span>
                </div>
                <div className="flex items-center gap-2 ml-2 shrink-0">
                  {d.active_dispensers > 0 && (
                    <span className="text-[10px] text-green-500">{d.active_dispensers} active</span>
                  )}
                  {d.volume_24h != null && d.volume_24h > 0 && (
                    <span className="text-[10px] text-zinc-500">{formatBtc(d.volume_24h)}</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )

  return (
    <>
      {/* Desktop search */}
      <div ref={containerRef} className="hidden sm:flex items-center flex-1 max-w-md mx-4">
        <div className="relative w-full">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => { if (totalResults > 0 && debouncedQuery.length >= 2) setOpen(true) }}
            onKeyDown={handleKeyDown}
            placeholder="Search markets..."
            className="w-full rounded-sm border border-zinc-800 bg-zinc-900 py-1.5 pl-8 pr-10 text-xs text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-zinc-600 focus:bg-zinc-900/80"
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-zinc-700 bg-zinc-800 px-1.5 py-px text-[10px] font-mono text-zinc-500">
            /
          </kbd>
          {open && dropdown}
        </div>
      </div>

      {/* Mobile search overlay */}
      {mobileOpen && (
        <div className="sm:hidden fixed inset-0 z-[200] bg-zinc-950/95 backdrop-blur-sm">
          <div ref={mobileContainerRef} className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="relative flex-1">
                <svg
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <input
                  ref={mobileInputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setMobileOpen(false)
                    } else {
                      handleKeyDown(e)
                    }
                  }}
                  placeholder="Search markets..."
                  className="w-full rounded-sm border border-zinc-700 bg-zinc-900 py-1.5 pl-8 pr-4 text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-600"
                />
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="text-xs text-zinc-400 hover:text-zinc-200 px-2 py-2"
              >
                Cancel
              </button>
            </div>
            {(open || (debouncedQuery.length >= 2)) && (
              <div className="rounded-sm border border-zinc-700 bg-zinc-900 overflow-hidden">
                {isLoading && debouncedQuery.length >= 2 && totalResults === 0 && (
                  <div className="px-3 py-3 text-xs text-zinc-500">Searching...</div>
                )}
                {!isLoading && debouncedQuery.length >= 2 && totalResults === 0 && (
                  <div className="px-3 py-3 text-xs text-zinc-500">No results found</div>
                )}
                {pairs.length > 0 && (
                  <div>
                    <div className="px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
                      Pairs
                    </div>
                    {pairs.map((p, i) => (
                      <button
                        key={p.pair}
                        onClick={() => navigate(`/trade/${p.pair.replace('/', '_')}`)}
                        className={`w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors ${
                          selectedIndex === i ? 'bg-zinc-800' : 'active:bg-zinc-800/50'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="h-6 w-6 rounded-sm bg-zinc-800 overflow-hidden flex items-center justify-center shrink-0">
                            <Image src={`${XCP_IMG_BASE}/icon/${p.base_asset}`} alt="" width={24} height={24} className="object-cover" unoptimized />
                          </div>
                          <span className="text-sm text-zinc-200 font-medium truncate">
                            {p.base_asset_longname || p.base_asset}
                            <span className="text-zinc-500">/{p.quote_asset}</span>
                          </span>
                        </div>
                        {p.volume_24h != null && p.volume_24h > 0 && (
                          <span className="text-[11px] text-zinc-500 ml-2 shrink-0">
                            {formatBtc(p.volume_24h)}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {dispensers.length > 0 && (
                  <div>
                    <div className={`px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500 border-b border-zinc-800 ${pairs.length > 0 ? 'border-t' : ''}`}>
                      Dispensers
                    </div>
                    {dispensers.map((d, i) => {
                      const idx = pairs.length + i
                      return (
                        <button
                          key={d.asset}
                          onClick={() => navigate(`/dispense/${d.asset}`)}
                          className={`w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors ${
                            selectedIndex === idx ? 'bg-zinc-800' : 'active:bg-zinc-800/50'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="h-6 w-6 rounded-sm bg-zinc-800 overflow-hidden flex items-center justify-center shrink-0">
                              <Image src={`${XCP_IMG_BASE}/icon/${d.asset}`} alt="" width={24} height={24} className="object-cover" unoptimized />
                            </div>
                            <span className="text-sm text-zinc-200 font-medium truncate">{d.asset_longname || d.asset}</span>
                          </div>
                          <div className="flex items-center gap-2 ml-2 shrink-0">
                            {d.active_dispensers > 0 && (
                              <span className="text-[11px] text-green-500">{d.active_dispensers} active</span>
                            )}
                            {d.volume_24h != null && d.volume_24h > 0 && (
                              <span className="text-[11px] text-zinc-500">{formatBtc(d.volume_24h)}</span>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
