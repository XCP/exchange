'use client'

import { useState } from 'react'

export function SearchInput() {
  const [query, setQuery] = useState('')

  return (
    <>
      {/* Desktop search */}
      <div className="hidden sm:flex items-center flex-1 max-w-md mx-4">
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
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search markets..."
            className="w-full rounded-sm border border-zinc-800 bg-zinc-900 py-1.5 pl-8 pr-10 text-xs text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-zinc-600 focus:bg-zinc-900/80"
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-zinc-700 bg-zinc-800 px-1.5 py-px text-[10px] font-mono text-zinc-500">
            /
          </kbd>
        </div>
      </div>

      {/* Mobile search button */}
      <button className="sm:hidden flex items-center justify-center h-7 w-7 rounded-sm border border-zinc-800 bg-zinc-900 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700 transition-colors">
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
      </button>
    </>
  )
}
