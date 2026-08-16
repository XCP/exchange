'use client'

import { useState, useEffect, useMemo } from 'react'
import { useTimeframeParam } from '@/lib/hooks/useTimeframeParam'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import type { Timeframe } from '@/lib/hooks/useAnalytics'
import { marketPath } from '@/utils/pairs'
import {
  useAnalyticsSummary,
  useAnalyticsCharts,
  useAnalyticsTraders,
} from '@/lib/hooks/useAnalytics'
import { useSatsMode } from '@/lib/sats-context'
import { formatBig, formatPct, pctColor, mergeDailyVolumes } from '@/utils/format-analytics'
import { formatPrice } from '@/utils/format-price'
import { XCP_IMG_BASE } from '@/utils/constants'
import { HideLowQualityToggle, TimeframePills } from '@/components/browse-controls'
import { CounterCard } from './counter-card'
import { LeaderboardTable, type LeaderboardRow } from './leaderboard-table'
import { TopTradersTable } from './top-traders-table'
import { MarketInfoTable, COMPARABLE_QUOTE } from '@/components/market-info-table'
import { RecentActivity } from './recent-activity'
import { HomeHero, LaunchStrip } from './home-hero'
import { QuoteMarquee } from './quote-marquee'
import { DispenseMarquee } from './dispense-marquee'
import { toSats } from '@/utils/numeric'
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
  'crystalscraft': 'NOCRYPTOPUNK',
  'dank-directory': 'DANKMEMECASH',
  'diecast': 'BPOLOSOMCXVI',
  'drooling-ape-bus-club': 'OFFTARGET',
  'fake-ape-club': 'HUSLEVERYDAY',
  'fake-commons': 'NOTAFAKERARE',
  'fake-munchkin': 'PEPEAQUA',
  'fake-rare': 'FAKEASF',
  'faux-bitcorn': 'BITCORNHOLIO',
  'faux-sogs': 'STSHRDX',
  'footballcoin': 'XFCPDANALVES',
  'force-of-will': 'FWCFCINVITAC',
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
  'jpja': 'OLGA',
  'weird-n-wild': 'WOLVERINE',
  'the-counterpart': 'POKEMON',
  'pokemon': 'PIKACHU',
  'punk-frens': 'A10004357611650284030',
  'npcs': 'A10267050732029322730',
}

type MobileMode = 'xcp' | 'btc'

// ── Main Orchestrator ───────────────────────────────────────────────

export default function AnalyticsPage() {
  // The same remembered window the Explore pages use, so a reader who picked
  // 1y over there does not land back on 30d here.
  const [timeframe, setTimeframe] = useTimeframeParam()
  const [hideLowQuality, setHideLowQuality] = useState(true)
  const [mobileMode, setMobileMode] = useState<MobileMode>('xcp')
  const [quoteAsset, setQuoteAsset] = useState('XCP')
  const { satsMode } = useSatsMode()
  const includeHidden = !hideLowQuality

  // Cascade: summary first → charts after summary → traders after charts
  const { isLoading: summaryLoading, ...summaryProps } = useAnalyticsSummary(timeframe, includeHidden, undefined, quoteAsset)
  const chartsReady = !summaryLoading
  const { isLoading: chartsLoading } = useAnalyticsCharts(timeframe, includeHidden, chartsReady)
  const tradersReady = chartsReady && !chartsLoading
  const { isLoading: tradersLoading, ...tradersProps } = useAnalyticsTraders(timeframe, includeHidden, tradersReady, quoteAsset)

  // Build dropdown options from marquee data (XCP always first)
  const quoteOptions = useMemo(() => {
    const active = new Set(summaryProps.quoteVolumes.filter(q => q.trade_count > 0).map(q => q.quote_asset))
    return ['XCP', ...QUOTE_CANDIDATES.filter(a => active.has(a))]
  }, [summaryProps.quoteVolumes])

  // Reset to XCP if current selection is no longer available (skip during loading)
  useEffect(() => {
    if (!summaryLoading && quoteAsset !== 'XCP' && !quoteOptions.includes(quoteAsset)) setQuoteAsset('XCP')
  }, [quoteOptions, quoteAsset, summaryLoading])

  return (
    <div className="px-4 py-8">
      <HomeHero />
      <LaunchStrip />

      {/*
        The tickers, back under the launch banner.
        
        They were cut when the browse window defaulted to 24h, where almost
        every row read "1 trades" — motion carrying no information. The
        default is all time now, and the same rows read PEPECASH 43,426
        trades, BITCRYSTALS 10,435, XCP 18,381 dispenses. The objection was
        to the numbers, not to the ticker, and the numbers changed.
      */}
      {summaryLoading ? (
        <MarqueeSkeleton />
      ) : (
        <>
          <div className={mobileMode === 'btc' ? 'hidden md:block' : ''}>
            <QuoteMarquee quoteVolumes={summaryProps.quoteVolumes} />
          </div>
          <div className={mobileMode === 'xcp' ? 'hidden md:block' : ''}>
            <DispenseMarquee topDispensers={summaryProps.topDispensers} satsMode={satsMode} />
          </div>
        </>
      )}

      {/* The numbers, and the controls that scope them. Below the hero rather
          than above it: they answer "how is it going", which is the second
          question, not the first. */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm uppercase tracking-wider text-zinc-400">Network activity</h2>
        <div className="flex items-center gap-3">
          <HideLowQualityToggle checked={hideLowQuality} onChange={setHideLowQuality} />
          <TimeframePills value={timeframe} onChange={setTimeframe} />
        </div>
      </div>

      <SummarySection timeframe={timeframe} includeHidden={includeHidden} isLoading={summaryLoading} mobileMode={mobileMode} quoteAsset={quoteAsset} quoteOptions={quoteOptions} onQuoteAssetChange={setQuoteAsset} {...summaryProps} />
      <RecentActivity mobileMode={mobileMode} />
      <ChartsSection timeframe={timeframe} includeHidden={includeHidden} ready={chartsReady} mobileMode={mobileMode} />
      <TradersSection isLoading={tradersLoading} mobileMode={mobileMode} quoteAsset={quoteAsset} quoteOptions={quoteOptions} onQuoteAssetChange={setQuoteAsset} {...tradersProps} />

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

function SummarySection({ timeframe, includeHidden, isLoading, mobileMode, quoteAsset, quoteOptions, onQuoteAssetChange, tradeSummary, dispenseSummary, topPairs, topDispensers, quoteVolumes, topTradedCollections, topDispensedCollections }: {
  timeframe: Timeframe
  includeHidden: boolean
  isLoading: boolean
  mobileMode: MobileMode
  quoteAsset: string
  quoteOptions: string[]
  onQuoteAssetChange: (asset: string) => void
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
    href: marketPath(p.pair),
    icon: p.base_asset,
    label: p.base_asset_longname ?? p.base_asset,
    cells: [
      { value: p.trade_count.toLocaleString() },
      { value: formatBig(p.volume) },
      { value: formatPct(p.price_change), className: pctColor(p.price_change) },
    ],
    sortValues: [p.trade_count, p.volume],
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
    sortValues: [c.trade_count, c.volume],
  }))

  const dispensedAssetRows: LeaderboardRow[] = topDispensers.map((d) => ({
    key: d.asset,
    href: `/buy/${d.asset}`,
    icon: d.asset,
    label: d.asset_longname ?? d.asset,
    cells: [
      { value: d.dispense_count.toLocaleString() },
      { value: formatPrice(d.volume, satsMode) },
      { value: formatPct(d.price_change), className: pctColor(d.price_change) },
    ],
    sortValues: [d.dispense_count, d.volume],
  }))

  const dispensedCollRows: LeaderboardRow[] = topDispensedCollections.map((c) => ({
    key: c.slug,
    href: `/dispensers?v=${c.slug}`,
    icon: COLLECTION_ICONS[c.slug],
    label: c.name,
    cells: [
      { value: c.dispense_count.toLocaleString() },
      { value: formatPrice(c.volume, satsMode) },
      { value: formatPct(c.price_change), className: pctColor(c.price_change) },
    ],
    sortValues: [c.dispense_count, c.volume],
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
            value={dispenseSummary ? formatBig(satsMode ? toSats(dispenseSummary.tf_volume) : dispenseSummary.tf_volume) + ` ${btcLabel.toUpperCase()}` : '\u2014'}
            sub={dispenseSummary && dispenseSummary.tf_dispenses > 0 ? `Avg: ${formatBig(satsMode ? toSats(dispenseSummary.tf_volume / dispenseSummary.tf_dispenses) : dispenseSummary.tf_volume / dispenseSummary.tf_dispenses)} ${btcLabel.toUpperCase()}` : undefined}
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

      {/* The two marquees are gone. They scrolled a row per quote asset and
          per dispensed asset, and on a network this quiet almost every row
          read "1 trades" or "1 dispenses" — motion carrying no information,
          above tables that carry it properly. */}

      {/* XCP-quoted only. Without it this table ranked every market on a
          volume figure denominated in its own quote asset, so a 6.9M
          DANKROSECASH market outranked a 328K XCP one. See COMPARABLE_QUOTE. */}
      <MarketInfoTable timeframe={timeframe} includeHidden={includeHidden} quote={COMPARABLE_QUOTE} />

      {/* Leaderboards */}
      <h2 className="text-sm uppercase tracking-wider text-zinc-400 mb-2">Leaderboards</h2>
      {isLoading ? (
        <LeaderboardSkeleton />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-8">
          <div className={mobileMode === 'btc' ? 'hidden md:block' : ''}>
            <LeaderboardTable
              title="Most Traded"
              titleExtra={quoteDropdown(quoteAsset, onQuoteAssetChange, quoteOptions)}
              tabs={[
                { label: 'Assets', headers: ['Asset', 'Trades', `Volume (${quoteAsset})`, 'Chg'], rows: tradedAssetRows, sortable: [true, true, false], defaultSortIndex: 1 },
                { label: 'Collections', headers: ['Collection', 'Trades', 'Volume (XCP)', 'Chg'], rows: tradedCollRows, sortable: [true, true, false], defaultSortIndex: 1 },
              ]}
            />
          </div>
          <div className={mobileMode === 'xcp' ? 'hidden md:block' : ''}>
            <LeaderboardTable
              title="Most Dispensed"
              tabs={[
                { label: 'Assets', headers: ['Asset', 'Dispenses', `Volume (${btcLabel})`, 'Chg'], rows: dispensedAssetRows, sortable: [true, true, false], defaultSortIndex: 1 },
                { label: 'Collections', headers: ['Collection', 'Dispenses', `Volume (${btcLabel})`, 'Chg'], rows: dispensedCollRows, sortable: [true, true, false], defaultSortIndex: 1 },
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
  const { satsMode } = useSatsMode()
  const btcLabel = satsMode ? 'sats' : 'BTC'
  const { dailyTradeVolume, dailyDispenseVolume, dailyBtcTradeVolume, isLoading } =
    useAnalyticsCharts(timeframe, includeHidden, ready)

  const mergedBtcVolume = mergeDailyVolumes(dailyBtcTradeVolume, dailyDispenseVolume)
  const btcChartData = satsMode
    ? mergedBtcVolume.map(d => ({ ...d, volume: toSats(d.volume) }))
    : mergedBtcVolume

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
            <ComboVolumeChart data={btcChartData} color="#3b82f6" label={`Trade Volume (${btcLabel})`} />
          </div>
        </div>
      )}
    </>
  )
}

// ── Traders: Top Traders ────────────────────────────────────────────

const QUOTE_CANDIDATES = [
  'PEPECASH', 'BITCORN', 'BITCRYSTALS', 'WILLCOIN', 'MAFIACASH', 'DANKMEMECASH',
  'XFCCOIN', 'FAKEAPECASH', 'BOBOCASH', 'RUSTBITS', 'OLINCOIN', 'NOJAK',
  'LICKOIN', 'DANKROSECASH', 'KEKO', 'GREEEEEECOIN', 'BITROCK',
]

const quoteDropdown = (quoteAsset: string, onChange: (v: string) => void, options: string[]) => (
  <select
    value={quoteAsset}
    onChange={(e) => onChange(e.target.value)}
    className="text-[10px] bg-zinc-800 text-zinc-300 border border-zinc-700 rounded px-1.5 py-0.5 outline-none cursor-pointer hover:border-zinc-600"
  >
    {options.map((a) => (
      <option key={a} value={a}>{a}</option>
    ))}
  </select>
)

function TradersSection({ topMakers, topTakers, topBtcBuyers, topBtcSellers, isLoading, mobileMode, quoteAsset, quoteOptions, onQuoteAssetChange }: {
  topMakers: ReturnType<typeof useAnalyticsTraders>['topMakers']
  topTakers: ReturnType<typeof useAnalyticsTraders>['topTakers']
  topBtcBuyers: ReturnType<typeof useAnalyticsTraders>['topBtcBuyers']
  topBtcSellers: ReturnType<typeof useAnalyticsTraders>['topBtcSellers']
  isLoading: boolean
  mobileMode: MobileMode
  quoteAsset: string
  quoteOptions: string[]
  onQuoteAssetChange: (asset: string) => void
}) {
  const { satsMode } = useSatsMode()
  const btcLabel = satsMode ? 'sats' : 'BTC'
  // Named for what it does to the LIST — a bare `toSats` here shadowed the
  // imported scalar helper and called itself.
  const listInSats = (list: typeof topBtcBuyers) =>
    satsMode ? list.map((t) => ({ ...t, volume: toSats(t.volume) })) : list
  return (
    <>
      <h2 className="text-sm uppercase tracking-wider text-zinc-400 mb-2">Top Traders</h2>
      {isLoading ? (
        <TradersSkeleton />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div className={mobileMode === 'btc' ? 'hidden md:block' : ''}>
            <TopTradersTable
              title="Top Traders"
              unit={quoteAsset}
              tabLabels={['Makers', 'Takers']}
              listA={topMakers}
              listB={topTakers}
              titleExtra={quoteDropdown(quoteAsset, onQuoteAssetChange, quoteOptions)}
            />
          </div>
          <div className={mobileMode === 'xcp' ? 'hidden md:block' : ''}>
            <TopTradersTable
              title={`Top Traders (${btcLabel})`}
              unit={btcLabel}
              tabLabels={['Makers', 'Takers']}
              listA={listInSats(topBtcSellers)}
              listB={listInSats(topBtcBuyers)}
            />
          </div>
        </div>
      )}
    </>
  )
}
