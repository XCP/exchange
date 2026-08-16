'use client'

import { Suspense, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useAssets, type AssetEntry, type AssetSort } from '@/lib/hooks/useAssets'
import { KIND_LABEL, KIND_HINT, type AssetKind } from '@/lib/asset-kind'
import { useTimeframeParam } from '@/lib/hooks/useTimeframeParam'
import { BrowseHeader, HideLowQualityToggle, StatGrid, TimeframePills } from '@/components/browse-controls'
import { CounterCard } from '@/components/home/counter-card'
import { Pagination } from '@/components/Pagination'
import { formatAmount } from '@/utils/format-amount'
import { formatPct, pctColor, formatBig } from '@/utils/format-analytics'
import { formatTimeAgo } from '@/utils/format-time-ago'
import { XCP_IMG_BASE } from '@/utils/constants'
import { marketPath } from '@/utils/pairs'

const PAGE_SIZE = 50

/**
 * One row per ASSET, not per market.
 *
 * The distinction is the whole point of having this tab beside Markets.
 * PEPECASH has four books; asking "how is PEPECASH doing" by picking one of
 * them is a guess. Here its markets are summed, and the row links to the
 * asset page rather than to a pair.
 *
 * The Kind column names what each row IS, and only that. Every value is a
 * fact about form — divisible or not, and how many exist — plus the one role
 * that outranks form, being what other markets are priced in. How much a row
 * trades is deliberately absent: it is already the Volume, Trades and Last
 * trade columns, and mixing it into Kind made "Token" mean "traded at least
 * three times" rather than anything about the asset.
 *
 * Measured against production: 92% of Counterparty is indivisible, so one
 * Collectible kind covered 89% of the network and filtered nothing. Supply is
 * what separates the things a reader actually wants apart — a 1-of-1 and a
 * run of three hundred are different objects.
 */
const KIND_FILTERS: (AssetKind | null)[] = [null, 'currency', 'token', 'edition', 'one_of_one']

/**
 * What each kind should be ranked by when you first ask for it.
 *
 * Volume is the right default for things that are bought and sold, and the
 * wrong one for money. XCP prices 6,361 markets — more than every other asset
 * combined — and scores zero XCP volume, because the only market XCP is the
 * base of is quoted in BTC. Ranking the currencies by volume puts the
 * exchange's own token at the bottom of the list of currencies, which is
 * true, useless, and reads as a bug.
 *
 * For money the measure of importance is how much is priced IN it, so that is
 * what the Currency filter opens on.
 */
const KIND_DEFAULT_SORT: Record<AssetKind, AssetSort> = {
  currency: 'quote_markets',
  token: 'xcp_volume',
  edition: 'xcp_volume',
  one_of_one: 'xcp_volume',
}

const KIND_CLASS: Record<AssetKind, string> = {
  currency: 'border-green-500/40 text-green-400',
  token: 'border-sky-500/40 text-sky-400',
  edition: 'border-amber-500/40 text-amber-400',
  // The rarest form gets the loudest badge; it is also the least common row.
  one_of_one: 'border-purple-500/40 text-purple-300',
}

interface Column {
  key: AssetSort
  label: (tf: string) => string
  align?: 'left'
}

const COLUMNS: Column[] = [
  { key: 'xcp_volume', label: (tf) => (tf === 'all' ? 'Volume (XCP)' : `${tf} volume (XCP)`) },
  { key: 'base_volume', label: () => 'Units traded' },
  { key: 'trades', label: () => 'Trades' },
  { key: 'markets', label: () => 'Markets' },
  { key: 'quote_markets', label: () => 'Quotes' },
  { key: 'dispensers', label: () => 'Dispensers' },
  { key: 'last_trade_time', label: () => 'Last trade' },
]

/** The leading row's figure, in whatever unit the list is ranked by. */
function topAssetSub(a: AssetEntry, sort: AssetSort): string {
  switch (sort) {
    case 'quote_markets':
      return `${a.quote_market_count.toLocaleString()} markets priced in it`
    case 'base_volume':
      return `${formatAmount(a.base_volume)} units traded`
    case 'trades':
      return `${a.trade_count.toLocaleString()} trades`
    case 'markets':
      return `${a.market_count.toLocaleString()} markets`
    case 'dispensers':
      return `${a.active_dispensers.toLocaleString()} dispensers`
    default:
      return `${formatBig(a.xcp_volume)} XCP`
  }
}

export default function ExploreAssetsPage() {
  return <Suspense><ExploreAssetsInner /></Suspense>
}

function ExploreAssetsInner() {
  const [timeframe, setTimeframe] = useTimeframeParam()
  const [hideLowQuality, setHideLowQuality] = useState(true)
  const [kind, setKind] = useState<AssetKind | null>(null)
  const [sort, setSort] = useState<AssetSort>('xcp_volume')
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')
  const [offset, setOffset] = useState(0)
  const includeHidden = !hideLowQuality

  // Any of these changes the underlying set, so page 8 of the old one is not
  // page 8 of the new one.
  const listKey = `${timeframe}:${includeHidden}:${kind}:${sort}:${order}`
  const [lastListKey, setLastListKey] = useState(listKey)
  if (lastListKey !== listKey) {
    setLastListKey(listKey)
    setOffset(0)
  }

  const { assets, total, isLoading } = useAssets({
    timeframe,
    sort,
    order,
    kind,
    limit: PAGE_SIZE,
    offset,
    includeHidden,
  })

  const handleSort = (key: AssetSort) => {
    if (key === sort) setOrder((o) => (o === 'desc' ? 'asc' : 'desc'))
    else {
      setSort(key)
      setOrder('desc')
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="px-4 py-8">
        <BrowseHeader title="Assets" subtitle="Every tradeable asset, summed across its markets and dispensers">
          <HideLowQualityToggle checked={hideLowQuality} onChange={setHideLowQuality} />
          <TimeframePills value={timeframe} onChange={setTimeframe} />
        </BrowseHeader>

        <StatGrid>
          <CounterCard
            label="Assets Listed"
            loading={isLoading && assets.length === 0}
            value={total.toLocaleString()}
            sub={kind ? KIND_LABEL[kind] : 'all kinds'}
          />
          <CounterCard
            label="Top Asset"
            loading={isLoading && assets.length === 0}
            value={assets[0] ? (assets[0].asset_longname ?? assets[0].asset) : '—'}
            // Quote whatever the list is currently ranked BY. Showing XCP
            // volume while the table is ordered by quotes reads as a
            // contradiction — XCP leads the currencies on 6,361 quotes and
            // zero volume, and "0 XCP" under its name looks like an error.
            sub={assets[0] ? topAssetSub(assets[0], sort) : undefined}
          />
          <CounterCard
            label="With Dispensers"
            loading={isLoading && assets.length === 0}
            value={assets.filter((a) => a.active_dispensers > 0).length.toLocaleString()}
            sub={`of ${assets.length} on this page`}
          />
          <CounterCard
            label="Window"
            loading={false}
            value={timeframe === 'all' ? 'All time' : timeframe}
            sub="volume, trades and last-trade"
          />
        </StatGrid>

        {/* Kind filter. Sits above the table rather than in the header because
            it changes what the rows ARE, not merely how they are ordered. */}
        <div className="mb-3 flex flex-wrap gap-1.5">
          {KIND_FILTERS.map((k) => (
            <button
              key={k ?? 'all'}
              type="button"
              onClick={() => {
                setKind(k)
                // Picking a kind picks its natural ranking. Explicit column
                // sorting still wins afterwards — this only sets the opening
                // view, the way switching to Currency should.
                setSort(k ? KIND_DEFAULT_SORT[k] : 'xcp_volume')
                setOrder('desc')
              }}
              title={k ? KIND_HINT[k] : 'Every asset, whatever kind'}
              className={`rounded-sm border px-2 py-1 text-[11px] font-medium transition-colors ${
                kind === k
                  ? 'border-zinc-600 bg-zinc-800 text-zinc-100'
                  : 'border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'
              }`}
            >
              {k ? KIND_LABEL[k] : 'All'}
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-sm border border-zinc-800 bg-zinc-900/50">
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500">
                  <th className="px-3 py-2 text-left font-normal">Asset</th>
                  <th className="px-3 py-2 text-left font-normal">Kind</th>
                  <th className="px-3 py-2 text-right font-normal">Price</th>
                  {COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className={`cursor-pointer select-none px-3 py-2 text-right font-normal hover:text-zinc-400${
                        sort === col.key ? ' text-zinc-300' : ''
                      }`}
                    >
                      {col.label(timeframe)} {sort === col.key ? (order === 'desc' ? '▼' : '▲') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {assets.map((a) => {
                  const label = a.asset_longname ?? a.asset
                  return (
                    <tr key={a.asset} className="border-b border-zinc-800/30 transition-colors last:border-0 hover:bg-zinc-800/50">
                      <td className="px-3 py-2">
                        <Link href={`/${encodeURIComponent(label)}`} className="flex items-center gap-1.5 font-medium text-zinc-200 hover:text-green-400">
                          <Image src={`${XCP_IMG_BASE}/icon/${a.asset}`} alt="" width={14} height={14} className="rounded-sm" sizes="14px" unoptimized />
                          <span className="max-w-[16rem] truncate">{label}</span>
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        {/* A kind this build does not know about renders as
                            nothing rather than an empty bordered box: the API
                            and the app deploy separately, so the two can be a
                            version apart for a few minutes. */}
                        {KIND_LABEL[a.kind] && (
                          <span className={`rounded-sm border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${KIND_CLASS[a.kind]}`}>
                            {KIND_LABEL[a.kind]}
                          </span>
                        )}
                      </td>
                      {/* The price of its DEEPEST market, labelled with which
                          one — an asset has no single price, and showing one
                          without naming the book it came from invents one. */}
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {a.top_price != null && a.top_pair ? (
                          <Link href={marketPath(a.top_pair)} className="text-zinc-300 hover:text-green-400">
                            {formatAmount(a.top_price)} <span className="text-zinc-500">{a.top_quote}</span>
                          </Link>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                        {a.top_price_change != null && timeframe !== 'all' && (
                          <span className={`ml-1.5 ${pctColor(a.top_price_change)}`}>{formatPct(a.top_price_change)}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-zinc-300">
                        {a.xcp_volume > 0 ? formatBig(a.xcp_volume) : <span className="text-zinc-600">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-zinc-400">
                        {a.base_volume > 0 ? formatAmount(a.base_volume) : <span className="text-zinc-600">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-zinc-400">
                        {a.trade_count > 0 ? a.trade_count.toLocaleString() : <span className="text-zinc-600">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-zinc-400">
                        {a.market_count > 0 ? a.market_count : <span className="text-zinc-600">—</span>}
                      </td>
                      {/* How many markets are priced IN this asset. Blank for
                          almost everything, and that is the point: a number
                          here is what separates money from merchandise. */}
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-zinc-400">
                        {a.quote_market_count > 0 ? a.quote_market_count.toLocaleString() : <span className="text-zinc-600">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {a.active_dispensers > 0 ? (
                          <Link href={`/buy/${encodeURIComponent(label)}`} className="text-zinc-300 hover:text-green-400">
                            {a.active_dispensers}
                          </Link>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-zinc-500">
                        {a.last_trade_time ? formatTimeAgo(a.last_trade_time) : '—'}
                      </td>
                    </tr>
                  )
                })}
                {!isLoading && assets.length === 0 && (
                  <tr><td colSpan={COLUMNS.length + 3} className="py-8 text-center text-zinc-500">No assets match this filter</td></tr>
                )}
                {isLoading && assets.length === 0 && (
                  <tr><td colSpan={COLUMNS.length + 3} className="py-8 text-center text-zinc-500">Loading assets...</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {total > PAGE_SIZE && (
            <div className="border-t border-zinc-800 px-3 py-2">
              <Pagination offset={offset} limit={PAGE_SIZE} total={total} onOffsetChange={setOffset} />
            </div>
          )}
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
          Volume is quoted in XCP and counts XCP-quoted markets only, so rows are comparable to each
          other. <span className="text-zinc-400">Units traded</span> is the asset&apos;s own unit summed across
          all of its markets — it compares a market to another market of the same asset, never one asset
          to another. <span className="text-zinc-400">Quotes</span> counts markets priced <em>in</em> this
          asset.
        </p>
      </div>
    </div>
  )
}
