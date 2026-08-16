'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Dialog } from '@/components/ui/dialog'
import { useSearch } from '@/lib/hooks/useSearch'
import { useMarkets } from '@/lib/hooks/useMarkets'
import { useAssets } from '@/lib/hooks/useAssets'
import { useDispenserMarkets } from '@/lib/hooks/useDispenserStats'
import { usePortfolioBalances } from '@/lib/hooks/usePortfolio'
import { useWallet } from '@/lib/wallet/wallet-context'
import { XCP_IMG_BASE } from '@/utils/constants'
import { formatAmount } from '@/utils/format-amount'

export type AssetSource = 'pairs' | 'dispensers' | 'holdings'

/**
 * One line in the picker. Declared rather than inferred: the three sources
 * build rows from three different API shapes, and letting TypeScript union
 * those made `held` unreachable behind an `in` narrow.
 */
interface PickerRow {
  asset: string
  longname: string | null
  label: string
  /** Right-aligned context — the quote asset, or how many dispensers are open. */
  detail: string | null
  price: number | null
  /** Holdings only: what this wallet has, shown in place of a price. */
  held?: string
}

/**
 * The searchable asset picker. Controlled by the caller, because the thing
 * that opens it is the asset chip inside the form — not a trigger of its own.
 *
 * Search is the site's own /search, which ranks by real activity, so the
 * list is the assets worth trading rather than an alphabetical dump.
 */
function dedupeByAsset(rows: PickerRow[]): PickerRow[] {
  const seen = new Set<string>()
  return rows.filter((r) => (seen.has(r.asset) ? false : (seen.add(r.asset), true)))
}

export function AssetSelect({
  open,
  onOpenChange,
  onSelect,
  source = 'pairs',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Both names: the protocol one drives APIs, the longname drives URLs. */
  onSelect: (asset: string, longname: string | null) => void
  /**
   * Which population is being picked from:
   *  - `pairs`       assets with a DEX market
   *  - `dispensers`  assets someone is currently selling from a dispenser
   *  - `holdings`    anything at all, browsing your own balances first —
   *                  for opening a dispenser, where the point is to create
   *                  a market that doesn't exist yet
   */
  source?: AssetSource
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Select asset"
      description="Search assets by name"
      className="max-w-md"
    >
      <AssetSearch
        source={source}
        onPick={(asset, longname) => {
          onSelect(asset, longname)
          onOpenChange(false)
        }}
      />
    </Dialog>
  )
}

/** Split out so its search state unmounts with the dialog and resets per open. */
function AssetSearch({
  source,
  onPick,
}: {
  source: AssetSource
  onPick: (asset: string, longname: string | null) => void
}) {
  const [query, setQuery] = useState('')
  const { address } = useWallet()
  const { data, isLoading } = useSearch(query)

  // With an empty box, offer something worth picking rather than an
  // instruction to type — but from the right population for the job.
  /**
   * All time, not 24h. Ranking the opening list by a day of volume meant
   * ranking it by zero — 95% of markets have not traded in a year — so "Most
   * active" was showing whatever the table happened to return first. The same
   * defect the search ranking had, and the same fix.
   */
  const { markets, isLoading: marketsLoading } = useMarkets({
    timeframe: 'all',
    limit: 12,
    quote: 'XCP',
  })
  const { markets: dispensed, isLoading: dispensedLoading } = useDispenserMarkets(12)
  const { balances, isLoading: balancesLoading } = usePortfolioBalances(
    source === 'holdings' ? address : null,
  )

  /**
   * The handful of assets everything else is priced in, pinned above the
   * list.
   *
   * Measured rather than hardcoded: ranking by how many markets use an asset
   * as their QUOTE is the empirical definition of "common here", and it
   * returns XCP (6,378 markets), PEPECASH (2,105), BITCRYSTALS (823),
   * DANKMEMECASH (575), BITCORN (306) — which is the list anyone who trades
   * on Counterparty would have written by hand, arrived at from the data. It
   * also stays right on its own as the network changes.
   *
   * "Most active" underneath answers a different question — what is moving
   * this month — and the two disagree constantly, which is why both are here.
   */
  const { assets: commonAssets } = useAssets({
    timeframe: 'all',
    sort: 'quote_markets',
    limit: 8,
    includeHidden: true,
  })
  const common = commonAssets
    // BTC prices 176 markets but cannot be a leg of a DEX swap, so it would
    // be a chip that fails on click.
    .filter((a) => a.asset !== 'BTC')
    .slice(0, 5)

  const browsing = query.length < 2

  const defaultRows: PickerRow[] =
    source === 'dispensers'
      ? dispensed.map((d) => ({
          asset: d.asset,
          longname: d.asset_longname,
          label: d.asset_longname ?? d.asset,
          detail: d.active_dispensers > 0 ? `${d.active_dispensers} open` : null,
          price: d.cheapest_price ?? d.last_dispense_price,
        }))
      : source === 'holdings'
        ? balances.map((b) => ({
            asset: b.asset,
            longname: null,
            label: b.asset,
            detail: null,
            price: null,
            held: b.quantity_normalized,
          }))
        : markets.map((m) => ({
            asset: m.base_asset,
            longname: m.base_asset_longname,
            label: m.base_asset_longname ?? m.base_asset,
            detail: m.quote_asset,
            price: m.last_price,
          }))

  const searchRows: PickerRow[] =
    source === 'dispensers'
      ? (data?.dispensers ?? []).map((d) => ({
          asset: d.asset,
          longname: d.asset_longname,
          label: d.asset_longname ?? d.asset,
          detail: d.active_dispensers > 0 ? `${d.active_dispensers} open` : null,
          price: d.cheapest_price ?? d.last_dispense_price,
        }))
      : source === 'holdings'
        ? // Opening a dispenser MAKES the market, so the search is every
          // asset that exists rather than only ones already being traded.
          (data?.assets ?? []).map((a) => ({
            asset: a.asset,
            longname: a.asset_longname,
            label: a.asset_longname ?? a.asset,
            detail: null,
            price: null,
          }))
        : (data?.pairs ?? []).map((p) => ({
            asset: p.base_asset,
            longname: p.base_asset_longname,
            label: p.base_asset_longname ?? p.base_asset,
            detail: p.quote_asset,
            price: p.last_price,
          }))

  /**
   * One row per ASSET, not per market.
   *
   * The market search returns a row per pair, so PEPECASH came back four
   * times — once for each book it trades in — and the picker asks which
   * asset you want, not which book. The first occurrence wins, which is the
   * best-ranked one because the server already ordered them.
   */
  const rows = dedupeByAsset(browsing ? defaultRows : searchRows)
  const loading = browsing
    ? source === 'dispensers'
      ? dispensedLoading
      : source === 'holdings'
        ? balancesLoading
        : marketsLoading
    : isLoading

  return (
    <div>
      <div className="border-b border-zinc-800 p-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search assets…"
          className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
        />
      </div>
      {/* Only while browsing, and only for the market picker: the dispenser
          and holdings pickers draw from populations where these are not
          special. */}
      {browsing && source === 'pairs' && common.length > 0 && (
        <div className="border-b border-zinc-800 px-2 py-2">
          <p className="mb-1.5 px-1 text-[11px] uppercase tracking-wider text-zinc-600">Common</p>
          <div className="flex flex-wrap gap-1.5">
            {common.map((a) => (
              <button
                key={a.asset}
                type="button"
                onClick={() => onPick(a.asset, a.asset_longname)}
                className="flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-800 py-1 pl-1 pr-2.5 text-xs font-medium text-zinc-200 transition-colors hover:border-zinc-500"
              >
                <PickerIcon asset={a.asset} label={a.asset_longname ?? a.asset} small />
                {a.asset_longname ?? a.asset}
              </button>
            ))}
          </div>
        </div>
      )}
      {browsing && rows.length > 0 && (
        <p className="border-b border-zinc-800 px-3 py-1.5 text-[11px] uppercase tracking-wider text-zinc-600">
          {source === 'dispensers'
            ? 'Most dispensed'
            : source === 'holdings'
              ? 'Your balances'
              : 'Most traded'}
        </p>
      )}
      <div className="max-h-[50vh] overflow-y-auto">
        {rows.map((row) => (
          <button
            key={`${row.asset}-${row.detail ?? ''}`}
            type="button"
            onClick={() => onPick(row.asset, row.longname)}
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-zinc-800/60"
          >
            <PickerIcon asset={row.asset} label={row.label} />
            <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">{row.label}</span>
            {row.detail && <span className="text-xs text-zinc-500">{row.detail}</span>}
            {row.held != null ? (
              <span className="font-mono text-xs text-zinc-400">{formatAmount(row.held)}</span>
            ) : row.price != null ? (
              <span className="font-mono text-xs text-zinc-400">{formatAmount(row.price)}</span>
            ) : null}
          </button>
        ))}
        {!loading && rows.length === 0 && (
          <p className="px-3 py-10 text-center text-sm text-zinc-500">
            {!browsing
              ? 'No assets match that search'
              : source === 'dispensers'
                ? 'No open dispensers right now'
                : source === 'holdings'
                  ? 'Nothing in this wallet yet — search for any asset to open a dispenser.'
                  : 'No active markets right now'}
          </p>
        )}
        {loading && rows.length === 0 && (
          <p className="px-3 py-10 text-center text-sm text-zinc-500">
            {!browsing ? 'Searching…' : source === 'holdings' ? 'Loading balances…' : 'Loading markets…'}
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * The row's artwork, or a monogram when there is none. Plenty of assets have
 * no icon on the CDN, and the browser's torn-page glyph reads as a broken
 * page rather than as a token without a picture.
 */
function PickerIcon({ asset, label, small = false }: { asset: string; label: string; small?: boolean }) {
  const [broken, setBroken] = useState(false)
  const size = small ? 'size-4' : 'size-6'
  if (!asset || broken) {
    return (
      <span
        aria-hidden
        className={`flex ${size} shrink-0 items-center justify-center rounded-full bg-zinc-700 text-[9px] font-bold text-zinc-400`}
      >
        {label.slice(0, 2).toUpperCase()}
      </span>
    )
  }
  return (
    <Image
      src={`${XCP_IMG_BASE}/icon/${asset}`}
      alt=""
      width={small ? 16 : 24}
      height={small ? 16 : 24}
      className={`${size} shrink-0 rounded-full object-cover`}
      sizes={small ? '16px' : '24px'}
      unoptimized
      onError={() => setBroken(true)}
    />
  )
}
