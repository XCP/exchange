'use client'

import { use, useState, useCallback, useMemo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import useSWR from 'swr'
import { fetcher, counterpartyUrl } from '@/lib/api/client'
import { useAllAssetMarkets } from '@/lib/hooks/useAssetMarkets'
import { useAssetDispensers } from '@/lib/hooks/useAssetDispensers'
import { useSatsMode } from '@/lib/sats-context'
import { formatAmount } from '@/utils/format-amount'
import { formatPrice } from '@/utils/format-price'
import { formatAddress } from '@/utils/format-address'
import { formatTimeAgo } from '@/utils/format-time-ago'
import { XCP_IMG_BASE } from '@/utils/constants'

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

export default function AssetPage({ params }: { params: Promise<{ asset: string }> }) {
  const { asset } = use(params)
  const { satsMode } = useSatsMode()

  const { info, isLoading: infoLoading } = useAssetInfo(asset)
  const { pairs, isLoading: pairsLoading } = useAllAssetMarkets(asset)
  const { dispensers, isLoading: dispensersLoading } = useAssetDispensers(asset)
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

  const cheapestDispensers = [...dispensers]
    .sort((a, b) => a.satoshi_price - b.satoshi_price)
    .slice(0, 5)

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
        break // just the top pair
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

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-2xl mx-auto px-6">

        {/* Asset hero */}
        <div className="pt-12 pb-8 flex flex-col items-center text-center">
          <Image
            src={`${XCP_IMG_BASE}/icon/${asset}`}
            alt={displayName}
            width={128}
            height={128}
            className="rounded-xl mb-8"
            unoptimized
          />
          <h1 className="text-3xl font-light text-white leading-none">
            {displayName}
          </h1>
          {displayName !== asset && (
            <span className="text-xs text-zinc-500 font-mono mt-2">{asset}</span>
          )}

          {/* Stats row */}
          {infoLoading ? (
            <span className="text-xs text-zinc-500 mt-4">Loading...</span>
          ) : info ? (
            <div className="flex items-center gap-3 mt-4 text-xs">
              <span className="text-zinc-400">
                {formatAmount(info.supply_normalized)} supply
              </span>
              {info.locked && (
                <>
                  <span className="text-zinc-700">|</span>
                  <span className="text-green-500">locked</span>
                </>
              )}
              {info.first_issuance_block_time && (
                <>
                  <span className="text-zinc-700">|</span>
                  <span className="text-zinc-400">{formatTimeAgo(info.first_issuance_block_time)}</span>
                </>
              )}
            </div>
          ) : (
            <span className="text-xs text-zinc-500 mt-4">Asset not found</span>
          )}
        </div>

        {/* Best prices — unified across dispensers, DEX */}
        {(bestPrices.bids.length > 0 || bestPrices.asks.length > 0) && (
          <div className="pb-10">
            <div className="grid grid-cols-2 gap-px">
              {/* Bid side (green — what buyers will pay) */}
              <div className="rounded-l-lg bg-zinc-900/40 py-5 px-4">
                <div className="text-[10px] tracking-[0.2em] text-zinc-500 mb-3 text-center">BID</div>
                {bestPrices.bids.length > 0 ? (
                  <div className="space-y-3">
                    {bestPrices.bids.map((b, i) => (
                      <Link
                        key={i}
                        href={b.href}
                        className="block text-center group"
                      >
                        <div className={`font-mono group-hover:text-green-300 transition-colors ${
                          i === 0 ? 'text-xl text-green-400' : 'text-sm text-green-400/70'
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

              {/* Ask side (red — what sellers want) */}
              <div className="rounded-r-lg bg-zinc-900/40 py-5 px-4">
                <div className="text-[10px] tracking-[0.2em] text-zinc-500 mb-3 text-center">ASK</div>
                {bestPrices.asks.length > 0 ? (
                  <div className="space-y-3">
                    {bestPrices.asks.map((a, i) => (
                      <Link
                        key={i}
                        href={a.href}
                        className="block text-center group"
                      >
                        <div className={`font-mono group-hover:text-red-300 transition-colors ${
                          i === 0 ? 'text-xl text-red-400' : 'text-sm text-red-400/70'
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

        {/* Description */}
        {info?.description && (
          <div className="pb-10 text-center">
            <p className="text-xs text-zinc-400 leading-relaxed max-w-md mx-auto break-words">
              {info.description}
            </p>
            {isJsonUrl(info.description) && !jsonData && (
              <button
                onClick={() => loadJson(info.description)}
                disabled={jsonLoading}
                className="mt-3 text-[10px] tracking-[0.2em] text-zinc-500 hover:text-white transition-colors duration-300 disabled:opacity-50"
              >
                {jsonLoading ? 'LOADING...' : 'INSPECT'}
              </button>
            )}
            {jsonError && (
              <p className="mt-2 text-[10px] text-red-400">{jsonError}</p>
            )}
          </div>
        )}

        {/* JSON images */}
        {jsonImages.length > 0 && (
          <div className="pb-10 flex justify-center gap-6 flex-wrap">
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
                  className="max-h-48 rounded-lg"
                />
                <span className="text-[10px] text-zinc-500 mt-2">{img.label}</span>
              </a>
            ))}
          </div>
        )}

        {/* JSON metadata */}
        {jsonData && (
          <div className="pb-10 max-w-md mx-auto">
            <div className="space-y-2">
              {Object.entries(jsonData)
                .filter(([key, val]) =>
                  val != null &&
                  val !== '' &&
                  !['image', 'image_large', 'image_large_hd', 'images', 'asset', 'success'].includes(key) &&
                  typeof val !== 'object'
                )
                .map(([key, val]) => (
                  <div key={key} className="flex justify-between gap-8 text-xs">
                    <span className="text-zinc-500">{formatKey(key)}</span>
                    <span className="text-zinc-300 text-right font-mono truncate max-w-[200px]">
                      {String(val)}
                    </span>
                  </div>
                ))}
            </div>
            {Array.isArray(jsonData.attributes) && (jsonData.attributes as Array<Record<string, unknown>>).length > 0 && (
              <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(jsonData.attributes as Array<{ trait_type?: string; value?: unknown }>).map((attr, i) => (
                  <div key={i} className="border border-zinc-800 rounded-sm px-3 py-2">
                    <div className="text-[10px] text-zinc-500">{attr.trait_type}</div>
                    <div className="text-xs text-zinc-300 font-mono">{String(attr.value)}</div>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => setJsonData(null)}
              className="mt-4 text-[10px] tracking-[0.2em] text-zinc-500 hover:text-zinc-300 transition-colors duration-300"
            >
              CLOSE
            </button>
          </div>
        )}

        {/* DEX pairs */}
        <div className="py-8">
          <SectionLabel
            label="ORDER BOOK"
            count={pairs.length}
            isLoading={pairsLoading}
            href={sortedPairs.length > 0 ? `/trade/${sortedPairs[0].pair.replace('/', '_')}` : undefined}
          />
          {pairsLoading ? (
            <Empty text="Loading..." />
          ) : sortedPairs.length === 0 ? (
            <Empty text="No DEX pairs" />
          ) : (
            <div className="space-y-1">
              {sortedPairs.slice(0, 5).map((p) => (
                <Link
                  key={p.pair}
                  href={`/trade/${p.pair.replace('/', '_')}`}
                  className="flex justify-between items-center py-1.5 hover:text-white transition-colors duration-300 group"
                >
                  <span className="text-xs text-zinc-400 group-hover:text-white">{p.pair}</span>
                  <div className="flex items-center gap-6 text-xs">
                    <span className="text-zinc-500 font-mono">
                      {p.last_price != null ? formatAmount(p.last_price) : '—'}
                    </span>
                    {p.price_change_24h != null && p.price_change_24h !== 0 && (
                      <span className={`font-mono ${p.price_change_24h >= 0 ? 'text-green-500' : 'text-red-400'}`}>
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

        {/* Dispensers */}
        <div className="py-8">
          <SectionLabel label="DISPENSERS" count={dispensers.length} isLoading={dispensersLoading} href={`/dispense/${asset}`} />
          {dispensersLoading ? (
            <Empty text="Loading..." />
          ) : cheapestDispensers.length === 0 ? (
            <Empty text="No open dispensers" />
          ) : (
            <div className="space-y-1">
              {cheapestDispensers.map((d) => (
                <Link
                  key={d.tx_hash}
                  href={`/dispense/${asset}`}
                  className="flex justify-between items-center py-1.5 hover:text-white transition-colors duration-300 group"
                >
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-zinc-300 font-mono group-hover:text-white">
                      {formatPrice(d.satoshi_price / 1e8, satsMode)}
                    </span>
                    <span className="text-zinc-600">per dispense</span>
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

        {/* Footer */}
        {info?.owner && (
          <footer className="py-12 text-center">
            <span className="text-[10px] tracking-[0.2em] text-zinc-600">
              OWNER {formatAddress(info.owner)}
            </span>
          </footer>
        )}

      </div>
    </div>
  )
}

function SectionLabel({ label, count, isLoading, href }: { label: string; count: number; isLoading: boolean; href?: string }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        <span className="text-[10px] tracking-[0.3em] text-zinc-500">{label}</span>
        {!isLoading && count > 0 && (
          <span className="text-[10px] text-zinc-600 font-mono">{count}</span>
        )}
      </div>
      {href && count > 0 && (
        <Link
          href={href}
          className="text-[10px] tracking-[0.2em] text-zinc-500 hover:text-white transition-colors duration-300"
        >
          VIEW ALL
        </Link>
      )}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="py-6 text-center text-xs text-zinc-600">{text}</div>
}
