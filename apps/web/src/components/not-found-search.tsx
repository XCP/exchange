'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useSearch } from '@/lib/hooks/useSearch'
import { XCP_IMG_BASE } from '@/utils/constants'

/**
 * Recovery search for the 404 page.
 *
 * Deliberately routes to /swap rather than an asset page: someone who landed
 * on a broken asset URL was almost certainly trying to trade it, and the
 * swap form is the surface that works for the widest range of assets.
 */
export function NotFoundSearch() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const { data, isLoading } = useSearch(query)

  const rows = [
    ...(data?.pairs ?? []).map((p) => ({
      asset: p.base_asset,
      label: p.base_asset_longname ?? p.base_asset,
      detail: `${p.quote_asset} market`,
    })),
    ...(data?.dispensers ?? []).map((d) => ({
      asset: d.asset,
      label: d.asset_longname ?? d.asset,
      detail: 'dispensers',
    })),
  ].slice(0, 8)

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 text-left">
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search for an asset…"
        className="w-full bg-transparent px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
      />
      {query.length >= 2 && (
        <div className="border-t border-zinc-800">
          {rows.map((row) => (
            <button
              key={`${row.asset}-${row.detail}`}
              type="button"
              onClick={() => router.push(`/swap/XCP/${encodeURIComponent(row.label)}`)}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-zinc-800/60"
            >
              <Image
                src={`${XCP_IMG_BASE}/icon/${row.asset}`}
                alt=""
                width={20}
                height={20}
                className="rounded-full"
                sizes="20px"
                unoptimized
              />
              <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">{row.label}</span>
              <span className="text-xs text-zinc-500">{row.detail}</span>
            </button>
          ))}
          {!isLoading && rows.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-zinc-500">No assets match that</p>
          )}
          {isLoading && rows.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-zinc-500">Searching…</p>
          )}
        </div>
      )}
    </div>
  )
}
