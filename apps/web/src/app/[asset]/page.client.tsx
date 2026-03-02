'use client'

import { use, useState, useCallback, useMemo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import useSWR from 'swr'
import { fetcher, counterpartyUrl } from '@/lib/api/client'
import { useAllAssetMarkets } from '@/lib/hooks/useAssetMarkets'
import { useAssetDispensers } from '@/lib/hooks/useAssetDispensers'
import { useHolders } from '@/lib/hooks/useHolders'
import { useDispenserStats } from '@/lib/hooks/useDispenserStats'
import { useOhlc } from '@/lib/hooks/useOhlc'
import { useSatsMode } from '@/lib/sats-context'
import { formatAmount } from '@/utils/format-amount'
import { formatPrice } from '@/utils/format-price'
import { formatAddress } from '@/utils/format-address'
import { formatTimeAgo } from '@/utils/format-time-ago'
import { XCP_IMG_BASE } from '@/utils/constants'
import { Sparkline } from '@/components/sparkline'

interface AssetInfo {
  asset: string
  asset_longname: string | null
  description: string
  issuer: string | null
  divisible: boolean
  locked: boolean
  supply: number
  supply_normalized: string
  owner: string | null
  first_issuance_block_index: number | null
  first_issuance_block_time: number | null
}

function useAssetInfo(asset: string) {
  const { data, error, isLoading } = useSWR<{ result: AssetInfo }>(
    asset ? counterpartyUrl(`/assets/${asset}?verbose=true`) : null,
    fetcher,
  )
  return { info: data?.result ?? null, error, isLoading }
}

function isJsonUrl(desc: string): boolean {
  if (!desc) return false
  const d = desc.trim()
  return (
    d.endsWith('.json') ||
    d.includes('.json') ||
    (d.startsWith('@') && d.slice(1).startsWith('http')) ||
    (d.startsWith('*') && d.slice(1).startsWith('http'))
  )
}

function formatKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
}

type TabKey = 'markets' | 'holders' | 'dispensers'

export default function AssetPage({ params }: { params: Promise<{ asset: string }> }) {
  const { asset } = use(params)
  const { satsMode } = useSatsMode()
  const [activeTab, setActiveTab] = useState<TabKey>('markets')

  const { info, isLoading: infoLoading } = useAssetInfo(asset)
  const { pairs, isLoading: pairsLoading } = useAllAssetMarkets(asset)
  const { dispensers, isLoading: dispensersLoading } = useAssetDispensers(asset)
  const { holders, total: holdersTotal, isLoading: holdersLoading } = useHolders(asset, info?.supply ?? 0)
  const { data: dispenserStats } = useDispenserStats(asset)
  const [jsonData, setJsonData] = useState<Record<string, unknown> | null>(null)
  const [jsonLoading, setJsonLoading] = useState(false)
  const [jsonError, setJsonError] = useState<string | null>(null)

  const loadJson = useCallback(async (url: string) => {
    setJsonLoading(true)
    setJsonError(null)
    try {
      let formatted = url.trim()
      if (formatted.startsWith('@') || formatted.startsWith('*')) formatted = formatted.slice(1)
      if (!formatted.startsWith('http')) formatted = `https://${formatted}`
      formatted = formatted.replace(/^http:\/\//, 'https://')

      const res = await fetch(formatted)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setJsonData(data)
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setJsonLoading(false)
    }
  }, [])

  const displayName = info?.asset_longname ?? asset

  const sortedPairs = useMemo(() =>
    [...pairs].sort((a, b) => (b.volume_24h ?? 0) - (a.volume_24h ?? 0)),
    [pairs]
  )

  // Primary pair for sparkline — highest volume
  const primaryPairSlug = sortedPairs.length > 0
    ? sortedPairs[0].pair.replace('/', '_')
    : null

  const { candles } = useOhlc(primaryPairSlug ?? '', '1D')
  const sparklineData = useMemo(() => {
    if (!candles.length) return []
    // Last 7 days of daily candles
    const recent = candles.slice(-7)
    return recent.map(c => c.c)
  }, [candles])

  const cheapestDispensers = useMemo(() =>
    [...dispensers].sort((a, b) => a.satoshi_price - b.satoshi_price),
    [dispensers]
  )

  // Unified best prices across all venues
  const bestPrices = useMemo(() => {
    const asks: { price: string; unit: string; label: string; href: string }[] = []
    const bids: { price: string; unit: string; label: string; href: string }[] = []

    // Dispensers (BTC-priced asks only)
    if (cheapestDispensers.length > 0) {
      const d = cheapestDispensers[0]
      asks.push({
        price: formatPrice(d.satoshi_price / 1e8, satsMode),
        unit: satsMode ? 'sats' : 'BTC',
        label: 'Dispenser',
        href: `/dispense/${asset}`,
      })
    }

    // DEX order book (per-pair)
    for (const p of sortedPairs) {
      if (p.best_ask != null) {
        asks.push({
          price: formatAmount(p.best_ask),
          unit: p.quote_asset,
          label: `DEX ${p.pair}`,
          href: `/trade/${p.pair.replace('/', '_')}`,
        })
        break
      }
    }

    for (const p of sortedPairs) {
      if (p.best_bid != null) {
        bids.push({
          price: formatAmount(p.best_bid),
          unit: p.quote_asset,
          label: `DEX ${p.pair}`,
          href: `/trade/${p.pair.replace('/', '_')}`,
        })
        break
      }
    }

    return { asks, bids }
  }, [sortedPairs, cheapestDispensers, asset, satsMode])

  // Extract images from JSON data
  const jsonImages: { url: string; label: string }[] = []
  if (jsonData) {
    const tryAdd = (key: string, val: unknown) => {
      if (typeof val === 'string' && (val.startsWith('http') || val.startsWith('//'))) {
        jsonImages.push({ url: val, label: key.replace(/_/g, ' ') })
      }
    }
    tryAdd('image', jsonData.image)
    tryAdd('image_large', jsonData.image_large)
    tryAdd('image_large_hd', jsonData.image_large_hd)
    if (Array.isArray(jsonData.images)) {
      for (const img of jsonData.images) {
        if (typeof img === 'object' && img && typeof (img as Record<string, unknown>).data === 'string') {
          tryAdd(
            (img as Record<string, unknown>).type as string || 'image',
            (img as Record<string, unknown>).data
          )
        }
      }
    }
  }

  const hasDispensers = dispensers.length > 0
  const hasDispenserStats = dispenserStats && dispenserStats.total_dispense_count != null && dispenserStats.total_dispense_count > 0

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-5xl mx-auto px-6">

        {/* Hero — full width */}
        <div className="pt-12 pb-8 flex flex-col items-center text-center">
          <Image
            src={`${XCP_IMG_BASE}/icon/${asset}`}
            alt={displayName}
            width={96}
            height={96}
            className="rounded-xl mb-6"
            unoptimized
          />
          <h1 className="text-3xl font-light text-white leading-none">
            {displayName}
          </h1>
          {displayName !== asset && (
            <span className="text-xs text-zinc-500 font-mono mt-2">{asset}</span>
          )}

          {infoLoading ? (
            <span className="text-xs text-zinc-500 mt-4">Loading...</span>
          ) : info ? (
            <div className="flex flex-wrap items-center justify-center gap-3 mt-4 text-xs">
              <span className="text-zinc-400">
                {formatAmount(info.supply_normalized)} supply
              </span>
              {info.locked && (
                <>
                  <span className="text-zinc-700">|</span>
                  <span className="text-green-500">locked</span>
                </>
              )}
              {info.divisible && (
                <>
                  <span className="text-zinc-700">|</span>
                  <span className="text-zinc-400">divisible</span>
                </>
              )}
              {info.first_issuance_block_time && (
                <>
                  <span className="text-zinc-700">|</span>
                  <span className="text-zinc-400">{formatTimeAgo(info.first_issuance_block_time)}</span>
                </>
              )}
              {info.owner && (
                <>
                  <span className="text-zinc-700">|</span>
                  <span className="text-zinc-500">owner {formatAddress(info.owner)}</span>
                </>
              )}
            </div>
          ) : (
            <span className="text-xs text-zinc-500 mt-4">Asset not found</span>
          )}
        </div>

        {/* Two-column layout */}
        <div className="flex flex-col lg:flex-row gap-8 pb-12">

          {/* Left column — main content */}
          <div className="flex-1 min-w-0">

            {/* Sparkline */}
            {primaryPairSlug && sparklineData.length >= 2 && (
              <div className="mb-8">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] tracking-[0.2em] text-zinc-500">7D PRICE</span>
                  <Link
                    href={`/trade/${primaryPairSlug}`}
                    className="text-[10px] tracking-[0.2em] text-zinc-500 hover:text-white transition-colors"
                  >
                    {sortedPairs[0].pair}
                  </Link>
                </div>
                <div className="bg-zinc-900/40 rounded-lg p-4">
                  <Sparkline data={sparklineData} height={100} />
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="flex border-b border-zinc-800">
              {(['markets', 'holders', 'dispensers'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                    activeTab === tab
                      ? 'text-zinc-100 border-b-2 border-green-500'
                      : 'text-zinc-500 border-b-2 border-transparent hover:text-zinc-300'
                  }`}
                >
                  {tab === 'markets' && `Markets${!pairsLoading && pairs.length > 0 ? ` (${pairs.length})` : ''}`}
                  {tab === 'holders' && `Holders${!holdersLoading && holdersTotal > 0 ? ` (${holdersTotal})` : ''}`}
                  {tab === 'dispensers' && `Dispensers${!dispensersLoading && dispensers.length > 0 ? ` (${dispensers.length})` : ''}`}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="min-h-[300px]">
              {/* Markets tab */}
              {activeTab === 'markets' && (
                <div>
                  {pairsLoading ? (
                    <Empty text="Loading..." />
                  ) : sortedPairs.length === 0 ? (
                    <Empty text="No DEX pairs" />
                  ) : (
                    <div className="divide-y divide-zinc-800/50">
                      {sortedPairs.map((p) => (
                        <Link
                          key={p.pair}
                          href={`/trade/${p.pair.replace('/', '_')}`}
                          className="flex justify-between items-center py-2.5 px-2 hover:bg-zinc-900/50 transition-colors group"
                        >
                          <span className="text-xs text-zinc-400 group-hover:text-white">{p.pair}</span>
                          <div className="flex items-center gap-6 text-xs">
                            <span className="text-zinc-300 font-mono">
                              {p.last_price != null ? formatAmount(p.last_price) : '—'}
                            </span>
                            {p.price_change_24h != null && p.price_change_24h !== 0 && (
                              <span className={`font-mono w-16 text-right ${p.price_change_24h >= 0 ? 'text-green-500' : 'text-red-400'}`}>
                                {p.price_change_24h >= 0 ? '+' : ''}{p.price_change_24h.toFixed(1)}%
                              </span>
                            )}
                            <span className="text-zinc-600 font-mono max-sm:hidden w-20 text-right">
                              {p.volume_24h != null && p.volume_24h > 0 ? formatAmount(p.volume_24h) : ''}
                            </span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Holders tab */}
              {activeTab === 'holders' && (
                <div>
                  {holdersLoading ? (
                    <Empty text="Loading holders..." />
                  ) : holders.length === 0 ? (
                    <Empty text="No holders found" />
                  ) : (
                    <table className="w-full text-xs whitespace-nowrap">
                      <thead className="sticky top-0 bg-zinc-950 z-10">
                        <tr className="text-zinc-500 border-b border-zinc-800">
                          <th className="text-left font-normal px-2 py-2">Address</th>
                          <th className="text-right font-normal px-2 py-2 max-sm:hidden">Balance</th>
                          <th className="text-right font-normal px-2 py-2">% Supply</th>
                        </tr>
                      </thead>
                      <tbody>
                        {holders.map((h) => (
                          <tr key={h.address} className="hover:bg-zinc-900/50 border-b border-zinc-800/30">
                            <td className="text-zinc-400 font-mono px-2 py-1.5">
                              <span className="sm:hidden">{h.addressShort}</span>
                              <span className="max-sm:hidden">{h.address}</span>
                              {h.tag && (
                                <span className="ml-1.5 text-yellow-500/80">({h.tag})</span>
                              )}
                            </td>
                            <td className="text-right text-zinc-400 font-mono px-2 py-1.5 max-sm:hidden">{h.balance}</td>
                            <td className="text-right text-zinc-500 font-mono px-2 py-1.5">{h.percentage.toFixed(2)}%</td>
                          </tr>
                        ))}
                        {holdersTotal - holders.length > 0 && (
                          <tr className="border-t border-zinc-800/50">
                            <td className="text-zinc-500 px-2 py-2">
                              And <span className="text-zinc-400">{(holdersTotal - holders.length).toLocaleString()}</span> more
                            </td>
                            <td className="max-sm:hidden" />
                            <td className="text-right text-zinc-500 font-mono px-2 py-2">
                              {Math.max(0, 100 - holders.reduce((s, h) => s + h.percentage, 0)).toFixed(2)}%
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* Dispensers tab */}
              {activeTab === 'dispensers' && (
                <div>
                  {dispensersLoading ? (
                    <Empty text="Loading..." />
                  ) : dispensers.length === 0 ? (
                    <Empty text="No open dispensers" />
                  ) : (
                    <div className="divide-y divide-zinc-800/50">
                      {cheapestDispensers.map((d) => (
                        <Link
                          key={d.tx_hash}
                          href={`/dispense/${asset}`}
                          className="flex justify-between items-center py-2.5 px-2 hover:bg-zinc-900/50 transition-colors group"
                        >
                          <div className="flex items-center gap-3 text-xs">
                            <span className="text-zinc-300 font-mono group-hover:text-white">
                              {formatPrice(d.satoshi_price / 1e8, satsMode)}
                            </span>
                            <span className="text-zinc-600">{satsMode ? 'sats' : 'BTC'}</span>
                          </div>
                          <div className="flex items-center gap-6 text-xs">
                            <span className="text-zinc-500 font-mono">{d.give_quantity_normalized} ea</span>
                            <span className="text-zinc-600 font-mono max-sm:hidden">{d.give_remaining_normalized} left</span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right column — sidebar */}
          <div className="lg:w-[300px] lg:flex-shrink-0 space-y-6">

            {/* Best prices */}
            {(bestPrices.bids.length > 0 || bestPrices.asks.length > 0) && (
              <div>
                <div className="text-[10px] tracking-[0.3em] text-zinc-500 mb-3">BEST PRICES</div>
                <div className="grid grid-cols-2 gap-px">
                  <div className="rounded-l-lg bg-zinc-900/40 py-4 px-3">
                    <div className="text-[10px] tracking-[0.2em] text-zinc-500 mb-2 text-center">BID</div>
                    {bestPrices.bids.length > 0 ? (
                      <div className="space-y-2">
                        {bestPrices.bids.map((b, i) => (
                          <Link key={i} href={b.href} className="block text-center group">
                            <div className={`font-mono group-hover:text-green-300 transition-colors ${
                              i === 0 ? 'text-lg text-green-400' : 'text-sm text-green-400/70'
                            }`}>
                              {b.price}
                            </div>
                            <div className="text-[10px] text-zinc-600 mt-0.5">
                              {b.unit} <span className="text-zinc-700">{b.label}</span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center text-xs text-zinc-600">—</div>
                    )}
                  </div>
                  <div className="rounded-r-lg bg-zinc-900/40 py-4 px-3">
                    <div className="text-[10px] tracking-[0.2em] text-zinc-500 mb-2 text-center">ASK</div>
                    {bestPrices.asks.length > 0 ? (
                      <div className="space-y-2">
                        {bestPrices.asks.map((a, i) => (
                          <Link key={i} href={a.href} className="block text-center group">
                            <div className={`font-mono group-hover:text-red-300 transition-colors ${
                              i === 0 ? 'text-lg text-red-400' : 'text-sm text-red-400/70'
                            }`}>
                              {a.price}
                            </div>
                            <div className="text-[10px] text-zinc-600 mt-0.5">
                              {a.unit} <span className="text-zinc-700">{a.label}</span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center text-xs text-zinc-600">—</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Asset info */}
            {info && (
              <div>
                <div className="text-[10px] tracking-[0.3em] text-zinc-500 mb-3">ASSET INFO</div>
                <div className="bg-zinc-900/40 rounded-lg p-4 space-y-2">
                  <InfoRow label="Supply" value={formatAmount(info.supply_normalized)} />
                  <InfoRow label="Divisible" value={info.divisible ? 'Yes' : 'No'} />
                  <InfoRow label="Locked" value={info.locked ? 'Yes' : 'No'} valueClass={info.locked ? 'text-green-400' : undefined} />
                  {info.first_issuance_block_time && (
                    <InfoRow label="First Issued" value={formatTimeAgo(info.first_issuance_block_time)} />
                  )}
                  {info.first_issuance_block_index && (
                    <InfoRow label="Block" value={`#${info.first_issuance_block_index.toLocaleString()}`} />
                  )}
                  {info.owner && (
                    <InfoRow label="Owner" value={formatAddress(info.owner)} mono />
                  )}
                  {info.issuer && info.issuer !== info.owner && (
                    <InfoRow label="Issuer" value={formatAddress(info.issuer)} mono />
                  )}
                </div>
              </div>
            )}

            {/* Dispenser stats */}
            {hasDispenserStats && dispenserStats && (
              <div>
                <div className="text-[10px] tracking-[0.3em] text-zinc-500 mb-3">DISPENSER STATS</div>
                <div className="bg-zinc-900/40 rounded-lg p-4 space-y-2">
                  {dispenserStats.total_btc_spent != null && (
                    <InfoRow label="Total BTC Spent" value={formatPrice(dispenserStats.total_btc_spent, satsMode)} />
                  )}
                  {dispenserStats.total_dispense_count != null && (
                    <InfoRow label="Total Dispenses" value={dispenserStats.total_dispense_count.toLocaleString()} />
                  )}
                  {dispenserStats.unique_buyers != null && (
                    <InfoRow label="Unique Buyers" value={dispenserStats.unique_buyers.toLocaleString()} />
                  )}
                  {dispenserStats.unique_sellers != null && (
                    <InfoRow label="Unique Sellers" value={dispenserStats.unique_sellers.toLocaleString()} />
                  )}
                  {dispenserStats.total_dispensers_created != null && (
                    <InfoRow label="Dispensers Created" value={dispenserStats.total_dispensers_created.toLocaleString()} />
                  )}
                  {dispenserStats.active_dispensers != null && (
                    <InfoRow label="Active Now" value={dispenserStats.active_dispensers.toLocaleString()} />
                  )}
                </div>
              </div>
            )}

            {/* Description */}
            {info?.description && (
              <div>
                <div className="text-[10px] tracking-[0.3em] text-zinc-500 mb-3">DESCRIPTION</div>
                <div className="bg-zinc-900/40 rounded-lg p-4">
                  <p className="text-xs text-zinc-400 leading-relaxed break-words">
                    {info.description}
                  </p>
                  {isJsonUrl(info.description) && !jsonData && (
                    <button
                      onClick={() => loadJson(info.description)}
                      disabled={jsonLoading}
                      className="mt-3 text-[10px] tracking-[0.2em] text-zinc-500 hover:text-white transition-colors duration-300 disabled:opacity-50"
                    >
                      {jsonLoading ? 'LOADING...' : 'INSPECT JSON'}
                    </button>
                  )}
                  {jsonError && (
                    <p className="mt-2 text-[10px] text-red-400">{jsonError}</p>
                  )}
                </div>
              </div>
            )}

            {/* JSON images */}
            {jsonImages.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {jsonImages.map((img, i) => (
                  <a
                    key={i}
                    href={img.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-col items-center"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt={img.label}
                      className="max-h-36 rounded-lg"
                    />
                    <span className="text-[10px] text-zinc-500 mt-1">{img.label}</span>
                  </a>
                ))}
              </div>
            )}

            {/* JSON metadata */}
            {jsonData && (
              <div>
                <div className="text-[10px] tracking-[0.3em] text-zinc-500 mb-3">METADATA</div>
                <div className="bg-zinc-900/40 rounded-lg p-4">
                  <div className="space-y-1.5">
                    {Object.entries(jsonData)
                      .filter(([key, val]) =>
                        val != null &&
                        val !== '' &&
                        !['image', 'image_large', 'image_large_hd', 'images', 'asset', 'success'].includes(key) &&
                        typeof val !== 'object'
                      )
                      .map(([key, val]) => (
                        <div key={key} className="flex justify-between gap-4 text-xs">
                          <span className="text-zinc-500 truncate">{formatKey(key)}</span>
                          <span className="text-zinc-300 text-right font-mono truncate max-w-[140px]">
                            {String(val)}
                          </span>
                        </div>
                      ))}
                  </div>
                  {Array.isArray(jsonData.attributes) && (jsonData.attributes as Array<Record<string, unknown>>).length > 0 && (
                    <div className="mt-4 grid grid-cols-2 gap-1.5">
                      {(jsonData.attributes as Array<{ trait_type?: string; value?: unknown }>).map((attr, i) => (
                        <div key={i} className="border border-zinc-800 rounded-sm px-2 py-1.5">
                          <div className="text-[10px] text-zinc-500">{attr.trait_type}</div>
                          <div className="text-xs text-zinc-300 font-mono">{String(attr.value)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => setJsonData(null)}
                    className="mt-3 text-[10px] tracking-[0.2em] text-zinc-500 hover:text-zinc-300 transition-colors duration-300"
                  >
                    CLOSE
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>

      </div>
    </div>
  )
}

function InfoRow({ label, value, mono, valueClass }: { label: string; value: string; mono?: boolean; valueClass?: string }) {
  return (
    <div className="flex justify-between gap-4 text-xs">
      <span className="text-zinc-500">{label}</span>
      <span className={`text-right truncate ${mono ? 'font-mono' : ''} ${valueClass ?? 'text-zinc-300'}`}>
        {value}
      </span>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="py-12 text-center text-xs text-zinc-600">{text}</div>
}
