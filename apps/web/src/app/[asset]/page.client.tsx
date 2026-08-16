'use client'

import { use, useState, useMemo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import useSWR from 'swr'
import { fetcher, counterpartyUrl, dexUrl } from '@/lib/api/client'
import { useAllAssetMarkets, type PairEntry } from '@/lib/hooks/useAssetMarkets'
import { useAssetDispensers } from '@/lib/hooks/useAssetDispensers'
import { useHolders } from '@/lib/hooks/useHolders'
import { useDispenserStats } from '@/lib/hooks/useDispenserStats'
import { useSatsMode } from '@/lib/sats-context'
import { formatAmount } from '@/utils/format-amount'
import { formatPrice } from '@/utils/format-price'
import { AssetLinksRow } from '@/components/asset/asset-links'
import { big } from '@/utils/numeric'
import { formatAddress } from '@/utils/format-address'
import { formatTimeAgo } from '@/utils/format-time-ago'
import { XCP_IMG_BASE } from '@/utils/constants'
import { CounterCard } from '@/components/home/counter-card'
import { TradeChart } from '@/components/trade-chart'
import { AssetTradeHistory } from '@/components/asset/asset-trade-history'
import { AssetTradePanel } from '@/components/asset/asset-trade-panel'
import { useXcpPrice } from '@/lib/hooks/useNetworkInfo'
import { type ChartTimeframe } from '@/lib/hooks/useTradeSeries'
import dynamic from 'next/dynamic'
import { marketPath } from '@/utils/pairs'

const ActivityChart = dynamic(() => import('@/components/activity-chart').then(m => ({ default: m.ActivityChart })), { ssr: false })

interface AssetInfo {
  asset: string; asset_longname: string | null; description: string
  issuer: string | null; divisible: boolean; locked: boolean
  supply: number; supply_normalized: string; owner: string | null
  first_issuance_block_index: number | null; first_issuance_block_time: number | null
}

interface RankEntry {
  metric: string; label: string; value: number
  rank: number; total: number; percentile: number
  scope: string; pair?: string
}

interface DexAgg {
  total_trades: number; total_volume: number; open_orders: number
  pair_count: number; active_pairs: number; unique_traders: number
}

interface RankingsData {
  asset: string; rankings: RankEntry[]; quote_pair_count: number
  dex: DexAgg | null
  collection: { slug: string; name: string; total_assets: number } | null
}

function useAssetInfo(asset: string) {
  const { data, isLoading } = useSWR<{ result: AssetInfo }>(
    asset ? counterpartyUrl(`/assets/${asset}?verbose=true`) : null, fetcher,
  )
  return { info: data?.result ?? null, isLoading }
}

function useRankings(asset: string) {
  const { data } = useSWR<RankingsData>(
    asset ? dexUrl(`/asset/${asset}/rankings`) : null, fetcher,
  )
  return data ?? null
}

function isJsonUrl(desc: string): boolean {
  if (!desc) return false
  const d = desc.trim()
  return d.endsWith('.json') || d.includes('.json') ||
    (d.startsWith('@') && d.slice(1).startsWith('http')) ||
    (d.startsWith('*') && d.slice(1).startsWith('http'))
}

function formatRank(r: RankEntry): string {
  if (r.rank <= 100) return `#${r.rank} of ${r.total.toLocaleString()}`
  if (r.percentile >= 90) return `Top ${Math.max(1, Math.round(100 - r.percentile))}%`
  if (r.percentile >= 50) return `Top ${Math.round(100 - r.percentile)}%`
  return ''
}

/**
 * Ranks an asset's markets by volume in THAT ASSET's units, not the quote's.
 *
 * `volume_24h` is quote-denominated, so ranking by it compares XCP against BTC
 * against SJCX as though they were one currency: PEPECASH's BTC market reads
 * 0.86 and sorts last, while in PEPECASH terms it is the second-deepest market
 * the asset has. Recent activity leads and all-time depth breaks the tie,
 * which matters because 95% of markets have no 24h volume at all.
 */
function byBaseVolume(a: PairEntry, b: PairEntry) {
  return (
    (b.base_volume_24h ?? 0) - (a.base_volume_24h ?? 0) ||
    (b.total_base_volume ?? 0) - (a.total_base_volume ?? 0)
  )
}

export default function AssetPage({ params }: { params: Promise<{ asset: string }> }) {
  const { asset } = use(params)
  const { satsMode } = useSatsMode()
  const [imgError, setImgError] = useState(false)
  // null until the visitor picks one; until then it follows the market's
  // own recency, so a dormant asset opens on a window with data in it.
  const [chartTf, setChartTf] = useState<ChartTimeframe | null>(null)
  /** Null follows the ranking; set once the visitor chooses a market. */
  const [pairChoice, setPairChoice] = useState<string | null>(null)
  const { xcpUsd } = useXcpPrice()

  const { info, isLoading: infoLoading } = useAssetInfo(asset)
  const { basePairs, quotePairs, isLoading: pairsLoading } = useAllAssetMarkets(asset)
  const { dispensers } = useAssetDispensers(asset)
  const { holders, total: holdersTotal } = useHolders(asset, info?.supply ?? 0)
  const { data: dispenserStats } = useDispenserStats(asset)
  const rankingsData = useRankings(asset)

  const { data: activityData } = useSWR<{ activity: { day: string; trades: number; dispenses: number; orders_placed: number; dispensers_created: number; sends: number }[] }>(
    asset ? dexUrl(`/asset/${asset}/activity`) : null, fetcher,
  )
  const displayName = info?.asset_longname ?? asset
  const btcUnit = satsMode ? 'sats' : 'BTC'
  const collection = rankingsData?.collection ?? null
  const quotePairCount = rankingsData?.quote_pair_count ?? 0
  const dex = rankingsData?.dex ?? null

  const sortedBase = useMemo(() => [...basePairs].sort(byBaseVolume), [basePairs])
  const allPairs = useMemo(() => {
    const seen = new Set(sortedBase.map(p => p.pair))
    const extra = quotePairs.filter(q => !seen.has(q.pair)).sort(byBaseVolume)
    return [...sortedBase, ...extra]
  }, [sortedBase, quotePairs])

  /**
   * The asset's own price, rather than one of its 44 markets' prices.
   *
   * `allPairs` is already ranked by 24h volume, so the deepest market is the
   * most defensible single answer to "what is this worth" — and the caption
   * names it, because a price without its market is a number without a unit.
   */
  /**
   * Only markets where this asset is the BASE can price it.
   *
   * Where it is the quote it is acting as money: a RAREPEPE/PEPECASH trade is
   * a sale of RAREPEPE that happened to be paid for in PEPECASH, and
   * inverting it would offer "1 PEPECASH = 0.0001 RAREPEPE" — a real number
   * denominated in something that is not a currency. Our own base/quote
   * canonicalisation already decides which side is money, so this just
   * respects it. Applied to XCP the rule leaves XCP/BTC, which is right: every
   * Y/XCP market prices Y.
   */
  const pricedPairs = sortedBase
  const ranked = pricedPairs[0] ?? null
  const primary = (pairChoice && pricedPairs.find((p) => p.pair === pairChoice)) || ranked
  const primaryUsd =
    primary?.quote_asset === 'XCP' && xcpUsd && primary.last_price != null
      ? primary.last_price * xcpUsd
      : null

  /**
   * Sorted and displayed on `price_normalized`, never `price`.
   *
   * Counterparty's `price` on a dispenser is in SATOSHIS — a 0.00786 BTC
   * dispenser reports 786000. Formatting that as BTC printed
   * "786,000.00000000 BTC", a hundred million times the real ask. The
   * `_normalized` fields are the BTC-denominated ones, which is what the
   * dispense form has always used.
   */
  const cheapestDispensers = useMemo(
    () => [...dispensers].sort((a, b) => big(a.price_normalized).comparedTo(big(b.price_normalized)) ?? 0),
    [dispensers],
  )

  const hasDispensers = dispensers.length > 0
  const hasDispenserStats = dispenserStats?.total_dispense_count != null && dispenserStats.total_dispense_count > 0
  const hasNoMarkets = !pairsLoading && allPairs.length === 0 && !hasDispensers

  const rankMap = new Map((rankingsData?.rankings ?? []).map(r => [r.metric, r]))
  const rankSub = (metric: string): string | undefined => {
    const r = rankMap.get(metric)
    return r ? formatRank(r) : undefined
  }

  const top10Pct = useMemo(() => {
    if (holders.length === 0) return 0
    return holders.slice(0, 10).reduce((s, h) => s + h.percentage, 0)
  }, [holders])

  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-100">
      <div className="px-4 py-6 max-w-7xl mx-auto">

        {/* ── Header ── */}
        <div className="flex items-start gap-5 mb-6">
          <div className="relative shrink-0 w-16 rounded-sm overflow-hidden bg-zinc-900 border border-zinc-800" style={{ aspectRatio: '5/7' }}>
            {infoLoading ? (
              <div className="absolute inset-0 animate-pulse bg-zinc-800" />
            ) : imgError ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <Image src={`${XCP_IMG_BASE}/icon/${asset}`} alt={displayName}
                  width={32} height={32} className="rounded-sm opacity-60" unoptimized />
              </div>
            ) : (
              <Image src={`${XCP_IMG_BASE}/full/${asset}`} alt={displayName}
                fill className="object-contain" unoptimized priority
                onError={() => setImgError(true)} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold text-zinc-100 text-balance truncate">{displayName}</h1>
              {collection && (
                <Link href={`/explore/markets?v=${collection.slug}`}
                  className="text-[10px] italic text-zinc-400 hover:text-zinc-200 transition-colors shrink-0">
                  {collection.name}
                </Link>
              )}
            </div>
            {info && (
              <p className="text-xs text-zinc-500 mt-0.5">
                {formatAmount(info.supply_normalized)} supply
                {info.locked ? ' · locked' : ''}
                {info.divisible ? ' · divisible' : ''}
                {info.first_issuance_block_time ? ` · ${formatTimeAgo(info.first_issuance_block_time)}` : ''}
                {holdersTotal > 0 ? ` · ${holdersTotal.toLocaleString()} holders` : ''}
              </p>
            )}
            {info?.description && !isJsonUrl(info.description) && (
              <p className="text-xs text-zinc-400 text-pretty mt-1.5 max-w-2xl">{info.description}</p>
            )}
            {/* Share, plus wherever the asset says it lives. The links come
                from the enhanced-info JSON its on-chain description points
                at; see app/api/asset-links. */}
            <AssetLinksRow
              asset={asset}
              displayName={displayName}
              fact={
                cheapestDispensers.length > 0
                  ? `${formatPrice(cheapestDispensers[0].price_normalized, satsMode)} ${btcUnit} · cheapest dispenser`
                  : primary?.last_price != null
                    ? `${formatAmount(primary.last_price)} ${primary.quote_asset}`
                    : info
                      ? `${formatAmount(info.supply_normalized)} supply`
                      : undefined
              }
            />
          </div>
        </div>

        {/* ── Price & chart ── */}
        {primary && (
          // Chart left, form right — the asset page is where the opinion is
          // formed, so the action belongs beside it rather than a URL away.
          <div className="mb-6 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="min-w-0">
            <TradeChart
              venue="market"
              pairSlug={primary.pair}
              asset={null}
              title={primary.pair.replace('_', ' / ')}
              quoteLabel={primary.quote_asset}
              timeframe={chartTf ?? 'All'}
              onTimeframeChange={setChartTf}
              headerRight={
                pricedPairs.length > 1 ? (
                  // Quote only: the base is this asset on every row, so
                  // repeating it would be noise. Ordered by base volume, so
                  // the list reads deepest-first.
                  <select
                    value={primary.pair}
                    onChange={(e) => {
                      setPairChoice(e.target.value)
                      // The new market may have a different history; let the
                      // window follow it unless the visitor pinned one.
                      setChartTf(null)
                    }}
                    aria-label="Chart market"
                    className="rounded-sm border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono text-[11px] text-zinc-300 focus:border-zinc-600 focus:outline-none"
                  >
                    {pricedPairs.map((p) => (
                      <option key={p.pair} value={p.pair}>
                        {p.quote_asset}
                      </option>
                    ))}
                  </select>
                ) : undefined
              }
              // Taller here: it sits beside a full trade form rather than
              // above one, so the default 180px left the rail lopsided.
              height={300}
            />
            <p className="mt-2 text-[11px] text-zinc-600">
              {primary.pair === ranked?.pair
                ? `Priced from ${primary.pair.replace('_', ' / ')} — most ${displayName} traded, of ${pricedPairs.length} market${pricedPairs.length === 1 ? '' : 's'} pricing it`
                : `Priced from ${primary.pair.replace('_', ' / ')} — one of ${pricedPairs.length} markets pricing it`}
              {primaryUsd != null && <span> · ≈ ${primaryUsd.toFixed(primaryUsd < 1 ? 6 : 2)}</span>}
            </p>
            </div>
            <AssetTradePanel asset={asset} assetLabel={displayName} />
          </div>
        )}

        {/* ── Stats: Row 1 (DEX) ── */}
        <div className="flex flex-col gap-2 mb-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <CounterCard
              label="Best Price"
              value={
                cheapestDispensers.length > 0
                  ? `${formatPrice(cheapestDispensers[0].price_normalized, satsMode)} ${btcUnit}`
                  : sortedBase.length > 0 && sortedBase[0].last_price != null
                    ? `${formatAmount(sortedBase[0].last_price!)} ${sortedBase[0].quote_asset}`
                    : '—'
              }
              sub={cheapestDispensers.length > 0 ? 'Cheapest dispenser' : sortedBase.length > 0 ? 'Last DEX price' : undefined}
              // A best price is a claim about ONE transaction, so it links to
              // it. Only the dispenser side has a single tx to point at; a
              // last DEX price is the tail of a book, not a row.
              href={
                cheapestDispensers.length > 0
                  ? `https://www.xcp.io/tx/${cheapestDispensers[0].tx_hash}`
                  : undefined
              }
            />
            <CounterCard
              label="Open Orders"
              value={dex?.open_orders ? dex.open_orders.toLocaleString() : '—'}
              sub={dex?.active_pairs ? `${dex.active_pairs} active pair${dex.active_pairs !== 1 ? 's' : ''}` : undefined}
            />
            <CounterCard
              label="DEX Trades"
              value={dex?.total_trades ? dex.total_trades.toLocaleString() : '—'}
              sub={rankSub('dex_trades')}
            />
            <CounterCard
              label={quotePairCount > 5 ? 'Quote Currency' : 'Unique Traders'}
              value={quotePairCount > 5 ? `${quotePairCount.toLocaleString()} pairs` : dex?.unique_traders ? dex.unique_traders.toLocaleString() : '—'}
              sub={quotePairCount > 5 ? 'Used as currency' : rankSub('dex_traders')}
            />
          </div>
          {/* Row 2 (BTC/Dispensers) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <CounterCard
              label="Dispenser Volume"
              value={hasDispenserStats && dispenserStats?.total_btc_spent != null ? `${formatPrice(dispenserStats.total_btc_spent, satsMode)} ${btcUnit}` : '—'}
              sub={rankSub('btc_spent')}
            />
            <CounterCard
              label="Dispensers Created"
              value={hasDispenserStats && dispenserStats?.total_dispensers_created != null ? dispenserStats.total_dispensers_created.toLocaleString() : '—'}
              sub={hasDispensers ? `${dispensers.length} open` : undefined}
            />
            <CounterCard
              label="Dispenses"
              value={hasDispenserStats && dispenserStats?.total_dispense_count != null ? dispenserStats.total_dispense_count.toLocaleString() : '—'}
              sub={rankSub('dispense_count')}
            />
            <CounterCard
              label="Active Dispensers"
              value={hasDispensers ? dispensers.length.toLocaleString() : '—'}
              sub={hasDispenserStats && dispenserStats?.unique_buyers != null ? `${dispenserStats.unique_buyers.toLocaleString()} unique buyers` : undefined}
            />
          </div>
        </div>

        {/* ── Section: Markets ── */}
        <h2 className="text-sm uppercase tracking-wider text-zinc-400 mb-2">Markets</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-8">
          {/* Order book first, dispensers second.
              The book is the venue with two sides, a price history and a
              quote in the asset's own market; a dispenser is a one-way ask
              in BTC. For an asset that has both, the book is the better
              first answer to "what is this worth". */}
          <div className="rounded-sm border border-zinc-800 bg-zinc-900/50">
            <div className="px-3 py-2 flex items-center justify-between">
              <span className="text-xs text-zinc-500">DEX Order Book</span>
              {allPairs.length > 5 && (
                <Link href={`/explore/markets?asset=${asset}`} className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors">
                  All {allPairs.length} →
                </Link>
              )}
            </div>
            {pairsLoading ? (
              <div className="text-center py-6 text-zinc-600 text-xs">Loading...</div>
            ) : allPairs.length === 0 ? (
              <div className="text-center py-6 text-zinc-600 text-xs">
                <p>No DEX markets</p>
                <Link href="/explore/orders" className="mt-1 inline-block text-zinc-500 hover:text-zinc-300 transition-colors">Browse markets →</Link>
              </div>
            ) : (
              <table className="w-full whitespace-nowrap text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500">
                    <th className="px-3 py-2 text-left font-normal">Pair</th>
                    <th className="px-3 py-2 text-right font-normal">Price</th>
                    <th className="px-3 py-2 text-right font-normal">24h</th>
                  </tr>
                </thead>
                <tbody>
                  {allPairs.slice(0, 5).map((p) => {
                    const other = p.base_asset === asset.toUpperCase() ? p.quote_asset : p.base_asset
                    return (
                      <tr key={p.pair} className="hover:bg-zinc-800/50 transition-colors border-b border-zinc-800/30 last:border-0">
                        <td className="px-3 py-1.5">
                          <Link href={marketPath(p.pair)} className="flex items-center gap-1.5 hover:underline">
                            <Image src={`${XCP_IMG_BASE}/icon/${other}`} alt="" width={14} height={14} className="rounded-sm" unoptimized />
                            <span className="text-zinc-200 truncate">{p.pair.replace('_', '/')}</span>
                          </Link>
                        </td>
                        <td className="text-right font-mono tabular-nums text-zinc-300 px-3 py-1.5">
                          {p.last_price != null ? formatAmount(p.last_price) : '—'}
                        </td>
                        <td className={`text-right font-mono tabular-nums px-3 py-1.5 ${
                          p.price_change_24h != null && p.price_change_24h >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {p.price_change_24h != null && p.price_change_24h !== 0
                            ? `${p.price_change_24h >= 0 ? '+' : ''}${p.price_change_24h.toFixed(1)}%` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
            {quotePairCount > 5 && (
              <div className="px-3 py-2 border-t border-zinc-800 text-[10px] text-zinc-400">
                Used as currency in {quotePairCount.toLocaleString()} trading pairs
              </div>
            )}
          </div>
          {/* Dispensers */}
          <div className="rounded-sm border border-zinc-800 bg-zinc-900/50">
            <div className="px-3 py-2 flex items-center justify-between">
              <span className="text-xs text-zinc-500">Dispensers</span>
              {hasDispensers && (
                <Link href={`/buy/${asset}`} className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors">
                  All {dispensers.length} →
                </Link>
              )}
            </div>
            {!hasDispensers ? (
              <div className="text-center py-6 text-zinc-600 text-xs">
                <p>No active dispensers</p>
                <Link href="/explore/dispensers" className="mt-1 inline-block text-zinc-500 hover:text-zinc-300 transition-colors">Browse dispensers →</Link>
              </div>
            ) : (
              <table className="w-full whitespace-nowrap text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500">
                    <th className="px-3 py-2 text-left font-normal">Eff. Price</th>
                    <th className="px-3 py-2 text-right font-normal">Per Dispense</th>
                    <th className="px-3 py-2 text-right font-normal">Remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {cheapestDispensers.slice(0, 5).map((d) => (
                    <tr key={d.tx_hash} className="hover:bg-zinc-800/50 transition-colors border-b border-zinc-800/30 last:border-0">
                      <td className="px-3 py-1.5">
                        <Link href={`/buy/${asset}`} className="flex items-center gap-1.5 hover:underline">
                          <Image src={`${XCP_IMG_BASE}/icon/BTC`} alt="" width={14} height={14} className="rounded-sm" unoptimized />
                          <span className="text-zinc-200 font-mono tabular-nums">{formatPrice(d.price_normalized, satsMode)}</span>
                          <span className="text-zinc-500">{btcUnit}</span>
                        </Link>
                      </td>
                      <td className="text-right font-mono tabular-nums text-zinc-400 px-3 py-1.5">{d.give_quantity_normalized}</td>
                      <td className="text-right font-mono tabular-nums text-zinc-500 px-3 py-1.5">{d.give_remaining_normalized}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

        </div>

        {hasNoMarkets && (
          <div className="text-center py-8 text-xs text-zinc-600 mb-8">
            <p>No active markets</p>
            <Link href="/explore/orders" className="mt-2 inline-block text-zinc-500 hover:text-zinc-300 transition-colors">Browse all markets →</Link>
          </div>
        )}

        {/* ── Section: Trade history across every pair and venue ── */}
        <div className="mb-6">
          <AssetTradeHistory asset={asset} />
        </div>

        {/* ── Section: Holders & Activity ── */}
        <h2 className="text-sm uppercase tracking-wider text-zinc-400 mb-2">Holders</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-8">
          {/* Top Holders */}
          <div className="rounded-sm border border-zinc-800 bg-zinc-900/50">
            <div className="px-3 py-2 flex items-center justify-between">
              <span className="text-xs text-zinc-500">Top Holders</span>
              {top10Pct > 0 && (
                <span className="text-[10px] text-zinc-400 font-mono tabular-nums">Top 10 own {top10Pct.toFixed(0)}%</span>
              )}
            </div>
            {holders.length === 0 ? (
              <div className="text-center py-6 text-zinc-600 text-xs">No holder data</div>
            ) : (
              <table className="w-full whitespace-nowrap text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500">
                    <th className="text-left font-normal px-3 py-1.5 w-6">#</th>
                    <th className="px-3 py-2 text-left font-normal">Address</th>
                    <th className="text-right font-normal px-3 py-1.5 max-sm:hidden">Balance</th>
                    <th className="px-3 py-2 text-right font-normal">%</th>
                  </tr>
                </thead>
                <tbody>
                  {holders.slice(0, 10).map((h, i) => (
                    <tr key={h.address} className="hover:bg-zinc-800/50 transition-colors border-b border-zinc-800/30 last:border-0">
                      <td className="px-3 py-1.5 text-zinc-500 tabular-nums">{i + 1}</td>
                      <td className="px-3 py-1.5 text-zinc-300 font-mono text-[11px]">
                        {h.addressShort}
                        {h.tag && <span className={`ml-1 ${h.tag === 'Burn' ? 'text-yellow-500/80' : 'text-blue-400/80'}`}>({h.tag})</span>}
                      </td>
                      <td className="text-right font-mono tabular-nums text-zinc-400 px-3 py-1.5 max-sm:hidden">{h.balance}</td>
                      <td className="text-right font-mono tabular-nums text-zinc-500 px-3 py-1.5">{h.percentage.toFixed(1)}%</td>
                    </tr>
                  ))}
                  {holdersTotal > 10 && (
                    <tr className="border-t border-zinc-800/50">
                      <td className="px-3 py-1.5" />
                      <td className="text-zinc-600 px-3 py-1.5 text-[10px]">+{(holdersTotal - 10).toLocaleString()} more</td>
                      <td className="max-sm:hidden" />
                      <td className="text-right font-mono tabular-nums text-zinc-600 px-3 py-1.5 text-[10px]">{Math.max(0, 100 - top10Pct).toFixed(1)}%</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Activity History */}
          {activityData?.activity && activityData.activity.length >= 10 ? (
            <ActivityChart data={activityData.activity} />
          ) : (
            <div className="rounded-sm border border-zinc-800 bg-zinc-900/50">
              <div className="px-3 py-2 text-xs text-zinc-500">Activity History</div>
              <div className="text-center py-6 text-zinc-600 text-xs">Not enough activity data</div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-zinc-600">
          {info?.owner && <span>Owner: <span className="font-mono">{formatAddress(info.owner)}</span></span>}
          {info?.issuer && info.issuer !== info.owner && <span>Issuer: <span className="font-mono">{formatAddress(info.issuer)}</span></span>}
          {info?.first_issuance_block_index && <span>Block #{info.first_issuance_block_index.toLocaleString()}</span>}
          <a href={`https://xcp.io/asset/${asset}`} target="_blank" rel="noopener noreferrer" className="hover:text-zinc-400 transition-colors">xcp.io</a>
          <a href={`https://xchain.io/asset/${asset}`} target="_blank" rel="noopener noreferrer" className="hover:text-zinc-400 transition-colors">xchain.io</a>
        </div>

      </div>
    </div>
  )
}
