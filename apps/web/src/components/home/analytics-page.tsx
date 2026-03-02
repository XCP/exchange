'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import type { Timeframe } from '@/lib/hooks/useAnalytics'
import {
  useAnalyticsSummary,
  useAnalyticsCharts,
  useAnalyticsTraders,
} from '@/lib/hooks/useAnalytics'
import { useSatsMode } from '@/lib/sats-context'
import { formatBig, formatPct, pctColor, mergeDailyVolumes } from '@/utils/format-analytics'
import { formatPrice } from '@/utils/format-price'
import { XCP_IMG_BASE } from '@/utils/constants'
import { TogglePills } from './toggle-pills'
import { CounterCard } from './counter-card'
import { LeaderboardTable, type LeaderboardRow } from './leaderboard-table'
import { TopTradersTable } from './top-traders-table'
import { QuoteMarquee } from './quote-marquee'
import { DispenseMarquee } from './dispense-marquee'
import {
  LeaderboardSkeleton,
  ChartsSkeleton,
  TradersSkeleton,
  MarqueeSkeleton,
} from './skeletons'

const ComboVolumeChart = dynamic(() => import('./combo-volume-chart'), { ssr: false })

// Representative icon asset for known collections
const COLLECTION_ICONS: Record<string, string> = {
  '17art': 'USDBITCOIN',
  'age-of-chains': 'GUARDIANCARD',
  'age-of-rust': 'RUSTBITS',
  'assetic': 'DATASSPEPE',
  'atomo': 'LATOMOC',
  'barnyard-club': 'BARNYARDCLUB',
  'bassmint': 'OFFTHEGRID',
  'bitcoin-war-bonds': 'A9919438720381432551',
  'bitcorn-crops': 'BITCORN',
  'bitgirls': 'TSUKASAVIX',
  'common-coco': 'A666240355190303432',
  'community-rewards': 'MEMEFAMILY',
  'counterparty-bitbowl': 'BEARSB',
  'crystalscraft': 'BITSUPREME',
  'dank-directory': 'DANKMEMECASH',
  'diecast': 'BPOLOSOMCXVI',
  'drooling-ape-bus-club': 'DABPOUILLOT',
  'fake-ape-club': 'HUSLEVERYDAY',
  'fake-commons': 'NOTAFAKERARE',
  'fake-munchkin': 'PEPEAQUA',
  'fake-rare': 'FAKEASF',
  'faux-bitcorn': 'KERNELISLAND',
  'faux-sogs': 'STSHRDX',
  'footballcoin': 'XFCPDANALVES',
  'force-of-will': 'FWSDLSUMMONC',
  'gameicon': 'YUMMYISLAND',
  'hodlpet': 'HODLPET',
  'kaleidoscope': 'BITROCK',
  'lfg-collection': 'ORANGEFIGHT',
  'mafia-wars': 'MAFIACASH',
  'memorychain': 'THEGODTANU',
  'modern-relics': 'RELICASH',
  'oasis-mining': 'CCGBTCONE',
  'penisium': 'PENISIMOON',
  'pepe-flags': 'PEPEFLAGPA',
  'phockheads': 'PHOCKHEADS',
  'fake-munchkin': 'PEPEAQUA',
  'rare-bobo': 'BOBOCASH',
  'rare-coco': 'RARECOCO',
  'rare-gogo': 'RAREGOGO',
  'rare-ordinal-directory': 'ORDINALPEPE',
  'rare-penpen': 'PEPENDULUM',
  'rare-pepe': 'PEPECASH',
  'rare-pigeons': 'RAREPIGEON',
  'rare-shadilay': 'SHADILAYCASH',
  'raresocks': 'SOCKSCAMCASH',
  'retroxcp': 'MARIOMOTO',
  'rude-relics': 'RELICASH',
  'sarutobi-island': 'NINJASUIT',
  'scannable-nfts': 'QRSEURAT',
  'skara': 'MANTLEASKAR',
  'spamgelo': 'DANKSPAMGELO',
  'spells-of-genesis': 'BITCRYSTALS',
  'stamps': 'A6360128538192758000',
  'the-pepe-project': 'ORANGEMAN',
  'the-wojak-way': 'RAREWOJAK',
  'wojak-npc': 'A4003111400514243181',
  'xcpinata': 'CUPCAKE',
}

const TF_OPTIONS = ['24h', '7d', '30d', 'all'] as const
const TF_LABELS: Record<Timeframe, string> = { '24h': '24h', '7d': '7d', '30d': '30d', all: 'All' }

type MobileMode = 'xcp' | 'btc'

// ── Main Orchestrator ───────────────────────────────────────────────

export default function AnalyticsPage() {
  const [timeframe, setTimeframe] = useState<Timeframe>('all')
  const [hideLowQuality, setHideLowQuality] = useState(true)
  const [mobileMode, setMobileMode] = useState<MobileMode>('xcp')
  const includeHidden = !hideLowQuality

  // Cascade: summary first → charts after summary → traders after charts
  const { isLoading: summaryLoading, ...summaryProps } = useAnalyticsSummary(timeframe, includeHidden)
  const chartsReady = !summaryLoading
  const { isLoading: chartsLoading } = useAnalyticsCharts(timeframe, includeHidden, chartsReady)
  const tradersReady = chartsReady && !chartsLoading
  const { isLoading: tradersLoading, ...tradersProps } = useAnalyticsTraders(timeframe, includeHidden, tradersReady)

  return (
    <div className="px-4 py-8">
      {/* Header + Controls */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100 mb-1">Dashboard</h1>
          <p className="text-xs text-zinc-500">Decentralized exchange metrics and leaderboards</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hideLowQuality}
              onChange={(e) => setHideLowQuality(e.target.checked)}
              className="accent-zinc-500 w-3 h-3"
            />
            <span className="text-xs text-zinc-500">Hide low quality</span>
          </label>
          <TogglePills
            options={TF_OPTIONS}
            value={timeframe}
            onChange={setTimeframe}
            label={(tf) => TF_LABELS[tf]}
          />
        </div>
      </div>

      <SummarySection timeframe={timeframe} includeHidden={includeHidden} isLoading={summaryLoading} mobileMode={mobileMode} {...summaryProps} />
      <ChartsSection timeframe={timeframe} includeHidden={includeHidden} ready={chartsReady} mobileMode={mobileMode} />
      <TradersSection isLoading={tradersLoading} mobileMode={mobileMode} {...tradersProps} />

      {/* Floating mobile XCP/BTC toggle */}
      <div className="md:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
        <div className="flex bg-zinc-900/90 backdrop-blur border border-zinc-700 rounded-full p-1 gap-1 shadow-lg shadow-black/40">
          {(['xcp', 'btc'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setMobileMode(mode)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                mobileMode === mode
                  ? 'bg-zinc-700 text-zinc-100'
                  : 'text-zinc-500'
              }`}
            >
              <Image
                src={`${XCP_IMG_BASE}/icon/${mode === 'xcp' ? 'XCP' : 'BTC'}`}
                alt=""
                width={16}
                height={16}
                className="rounded-full"
                unoptimized
              />
              {mode === 'xcp' ? 'XCP' : 'BTC'}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Summary: Counter Cards + Marquee + Leaderboards ─────────────────

function SummarySection({ timeframe, includeHidden, isLoading, mobileMode, tradeSummary, dispenseSummary, topPairs, topDispensers, quoteVolumes, topTradedCollections, topDispensedCollections }: {
  timeframe: Timeframe
  includeHidden: boolean
  isLoading: boolean
  mobileMode: MobileMode
  tradeSummary: ReturnType<typeof useAnalyticsSummary>['tradeSummary']
  dispenseSummary: ReturnType<typeof useAnalyticsSummary>['dispenseSummary']
  topPairs: ReturnType<typeof useAnalyticsSummary>['topPairs']
  topDispensers: ReturnType<typeof useAnalyticsSummary>['topDispensers']
  quoteVolumes: ReturnType<typeof useAnalyticsSummary>['quoteVolumes']
  topTradedCollections: ReturnType<typeof useAnalyticsSummary>['topTradedCollections']
  topDispensedCollections: ReturnType<typeof useAnalyticsSummary>['topDispensedCollections']
}) {
  const { satsMode } = useSatsMode()
  const btcLabel = satsMode ? 'sats' : 'BTC'
  const isAll = timeframe === 'all'

  // Build leaderboard row data
  const tradedAssetRows: LeaderboardRow[] = topPairs.map((p) => ({
    key: p.pair,
    href: `/trade/${p.pair}`,
    icon: p.base_asset,
    label: `${p.base_asset_longname ?? p.base_asset}/${p.quote_asset}`,
    cells: [
      { value: p.trade_count.toLocaleString() },
      { value: formatBig(p.volume) },
      { value: formatPct(p.price_change), className: pctColor(p.price_change) },
    ],
  }))

  const tradedCollRows: LeaderboardRow[] = topTradedCollections.map((c) => ({
    key: c.slug,
    href: `/trade?v=${c.slug}`,
    icon: COLLECTION_ICONS[c.slug],
    label: c.name,
    cells: [
      { value: c.trade_count.toLocaleString() },
      { value: formatBig(c.volume) },
      { value: formatPct(c.price_change), className: pctColor(c.price_change) },
    ],
  }))

  const dispensedAssetRows: LeaderboardRow[] = topDispensers.map((d) => ({
    key: d.asset,
    href: `/dispense/${d.asset}`,
    icon: d.asset,
    label: d.asset_longname ?? d.asset,
    cells: [
      { value: formatPrice(d.volume, satsMode) },
      { value: formatPct(d.price_change), className: pctColor(d.price_change) },
    ],
  }))

  const dispensedCollRows: LeaderboardRow[] = topDispensedCollections.map((c) => ({
    key: c.slug,
    href: `/dispense?v=${c.slug}`,
    icon: COLLECTION_ICONS[c.slug],
    label: c.name,
    cells: [
      { value: c.dispense_count.toLocaleString() },
      { value: formatPrice(c.volume, satsMode) },
      { value: formatPct(c.price_change), className: pctColor(c.price_change) },
    ],
  }))

  return (
    <>
      {/* Counter Cards — split into XCP and BTC groups */}
      <div className="flex flex-col gap-2 mb-6">
        <div className={`grid grid-cols-2 md:grid-cols-4 gap-2 ${mobileMode === 'btc' ? 'hidden md:grid' : ''}`}>
          <CounterCard
            label="Trade Volume (XCP)"
            loading={isLoading}
            value={tradeSummary ? formatBig(tradeSummary.tf_volume) + ' XCP' : '\u2014'}
            sub={tradeSummary && tradeSummary.tf_trades > 0 ? `Avg: ${formatBig(tradeSummary.tf_volume / tradeSummary.tf_trades)} XCP` : undefined}
          />
          <CounterCard
            label="Orders Placed"
            loading={isLoading}
            value={tradeSummary ? tradeSummary.tf_orders.toLocaleString() : '\u2014'}
            sub={tradeSummary ? `${tradeSummary.open_orders.toLocaleString()} open` : undefined}
          />
          <CounterCard
            label="Trades"
            loading={isLoading}
            value={tradeSummary ? tradeSummary.tf_trades.toLocaleString() : '\u2014'}
            sub={tradeSummary?.tf_unique_traders ? `${tradeSummary.tf_unique_traders.toLocaleString()} addresses` : undefined}
          />
          <CounterCard
            label="Active Pairs"
            loading={isLoading}
            value={tradeSummary ? tradeSummary.active_pairs.toLocaleString() : '\u2014'}
            sub={tradeSummary ? (isAll ? `${tradeSummary.total_pairs.toLocaleString()} total` : tradeSummary.new_pairs ? `${tradeSummary.new_pairs.toLocaleString()} new` : undefined) : undefined}
          />
        </div>
        <div className={`grid grid-cols-2 md:grid-cols-4 gap-2 ${mobileMode === 'xcp' ? 'hidden md:grid' : ''}`}>
          <CounterCard
            label="Dispense Volume"
            loading={isLoading}
            value={dispenseSummary ? formatBig(dispenseSummary.tf_volume) + ` ${btcLabel.toUpperCase()}` : '\u2014'}
            sub={dispenseSummary && dispenseSummary.tf_dispenses > 0 ? `Avg: ${formatBig(dispenseSummary.tf_volume / dispenseSummary.tf_dispenses)} ${btcLabel.toUpperCase()}` : undefined}
          />
          <CounterCard
            label="Dispensers Created"
            loading={isLoading}
            value={dispenseSummary ? dispenseSummary.tf_dispensers_created.toLocaleString() : '\u2014'}
            sub={dispenseSummary ? `${dispenseSummary.open_dispensers.toLocaleString()} open` : undefined}
          />
          <CounterCard
            label="Dispenses"
            loading={isLoading}
            value={dispenseSummary ? dispenseSummary.tf_dispenses.toLocaleString() : '\u2014'}
            sub={dispenseSummary?.tf_unique_buyers ? `${dispenseSummary.tf_unique_buyers.toLocaleString()} addresses` : undefined}
          />
          <CounterCard
            label="Active Dispensers"
            loading={isLoading}
            value={dispenseSummary ? dispenseSummary.active_assets.toLocaleString() : '\u2014'}
            sub={dispenseSummary ? (isAll ? `${dispenseSummary.total_assets.toLocaleString()} total` : dispenseSummary.new_assets ? `${dispenseSummary.new_assets.toLocaleString()} new` : undefined) : undefined}
          />
        </div>
      </div>

      {/* Quote Volume Marquee Ticker — XCP on mobile:xcp, BTC on mobile:btc, both on desktop */}
      {isLoading ? (
        <MarqueeSkeleton />
      ) : (
        <>
          <div className={mobileMode === 'btc' ? 'hidden md:block' : ''}>
            <QuoteMarquee quoteVolumes={quoteVolumes} />
          </div>
          <div className={mobileMode === 'xcp' ? 'hidden md:block' : ''}>
            <DispenseMarquee topDispensers={topDispensers} satsMode={satsMode} />
          </div>
        </>
      )}

      {/* Leaderboards */}
      <h2 className="text-sm uppercase tracking-wider text-zinc-400 mb-2">Leaderboards</h2>
      {isLoading ? (
        <LeaderboardSkeleton />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-8">
          <div className={mobileMode === 'btc' ? 'hidden md:block' : ''}>
            <LeaderboardTable
              title="Most Traded (By Count)"
              tabs={[
                { label: 'Assets', headers: ['Pair', 'Trades', 'Volume', 'Chg'], rows: tradedAssetRows },
                { label: 'Collections', headers: ['Collection', 'Trades', 'Volume (XCP)', 'Chg'], rows: tradedCollRows },
              ]}
            />
          </div>
          <div className={mobileMode === 'xcp' ? 'hidden md:block' : ''}>
            <LeaderboardTable
              title="Most Dispensed (By Volume)"
              tabs={[
                { label: 'Assets', headers: ['Asset', 'Volume (BTC)', 'Chg'], rows: dispensedAssetRows },
                { label: 'Collections', headers: ['Collection', 'Dispenses', 'Volume (BTC)', 'Chg'], rows: dispensedCollRows },
              ]}
            />
          </div>
        </div>
      )}
    </>
  )
}

// ── Charts: Volume History ──────────────────────────────────────────

function ChartsSection({ timeframe, includeHidden, ready, mobileMode }: { timeframe: Timeframe; includeHidden: boolean; ready: boolean; mobileMode: MobileMode }) {
  const { dailyTradeVolume, dailyDispenseVolume, dailyBtcTradeVolume, isLoading } =
    useAnalyticsCharts(timeframe, includeHidden, ready)

  const mergedBtcVolume = mergeDailyVolumes(dailyBtcTradeVolume, dailyDispenseVolume)

  return (
    <>
      <h2 className="text-sm uppercase tracking-wider text-zinc-400 mb-2">Volume History</h2>
      {isLoading ? (
        <ChartsSkeleton />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-8">
          <div className={mobileMode === 'btc' ? 'hidden md:block' : ''}>
            <ComboVolumeChart data={dailyTradeVolume} color="#22c55e" label="Trade Volume (XCP)" />
          </div>
          <div className={mobileMode === 'xcp' ? 'hidden md:block' : ''}>
            <ComboVolumeChart data={mergedBtcVolume} color="#3b82f6" label="Trade Volume (BTC)" />
          </div>
        </div>
      )}
    </>
  )
}

// ── Traders: Top Traders ────────────────────────────────────────────

function TradersSection({ topMakers, topTakers, topBtcBuyers, topBtcSellers, isLoading, mobileMode }: {
  topMakers: ReturnType<typeof useAnalyticsTraders>['topMakers']
  topTakers: ReturnType<typeof useAnalyticsTraders>['topTakers']
  topBtcBuyers: ReturnType<typeof useAnalyticsTraders>['topBtcBuyers']
  topBtcSellers: ReturnType<typeof useAnalyticsTraders>['topBtcSellers']
  isLoading: boolean
  mobileMode: MobileMode
}) {
  return (
    <>
      <h2 className="text-sm uppercase tracking-wider text-zinc-400 mb-2">Top Traders</h2>
      {isLoading ? (
        <TradersSkeleton />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div className={mobileMode === 'btc' ? 'hidden md:block' : ''}>
            <TopTradersTable
              title="Top Traders (XCP)"
              unit="XCP"
              tabLabels={['Makers', 'Takers']}
              listA={topMakers}
              listB={topTakers}
            />
          </div>
          <div className={mobileMode === 'xcp' ? 'hidden md:block' : ''}>
            <TopTradersTable
              title="Top Traders (BTC)"
              unit="BTC"
              tabLabels={['Makers', 'Takers']}
              listA={topBtcSellers}
              listB={topBtcBuyers}
            />
          </div>
        </div>
      )}
    </>
  )
}
