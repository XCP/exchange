'use client'

import { Suspense } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  useLaunches,
  useLaunchStats,
  XCP69_MIN_MINTERS,
  type Launch,
  type LaunchStats,
} from '@/lib/hooks/useLaunches'
import { useAssets, type AssetEntry } from '@/lib/hooks/useAssets'
import { useTimeframeParam } from '@/lib/hooks/useTimeframeParam'
import { BrowseHeader, StatGrid, TimeframePills } from '@/components/browse-controls'
import { CounterCard } from '@/components/home/counter-card'
import { formatAmount } from '@/utils/format-amount'
import { formatPct, pctColor, formatBig } from '@/utils/format-analytics'
import { formatTimeAgo } from '@/utils/format-time-ago'
import { XCP_IMG_BASE, XCP_FUN_BASE } from '@/utils/constants'
import { marketPath } from '@/utils/pairs'

/**
 * Assets that came from a completed XCP-69 launch.
 *
 * The Assets table, narrowed to one origin story. That is the whole idea: a
 * launch is only interesting here once it has produced something tradeable,
 * so the columns are the ones every other asset is judged by — volume,
 * trades, markets, price — not a mint progress bar.
 *
 * Top level rather than an Explore tab: the Explore surfaces browse what
 * exists on Counterparty, and this browses one standard's output.
 *
 * GRADUATED only. A scheduled or minting launch has no supply in circulation,
 * no pool and no price; listing it here would put four dashes in every column
 * and call it a market. Those live on xcp.fun, which is where the empty state
 * points, and where minting actually happens. This site deliberately has no
 * fairminter or mint surface — see the note on useLaunches.
 */

/** The set is small enough to page in one request for the foreseeable future. */
const MAX_ROWS = 200

export default function ExploreLaunchesPage() {
  return (
    <Suspense>
      <LaunchesInner />
    </Suspense>
  )
}

function LaunchesInner() {
  const [timeframe, setTimeframe] = useTimeframeParam()
  const { launches, isLoading: launchesLoading, error } = useLaunches()

  const graduated = launches.filter((l) => l.phase === 'graduated')
  const names = graduated.map((l) => l.asset)

  /**
   * What is happening right now, for the empty state to say instead of a
   * paragraph about the rules. From /v2/stats rather than summed off the
   * launch list: its minter count is DISTINCT addresses, and summing the
   * per-launch figures would count anyone backing two launches twice.
   */
  const { stats } = useLaunchStats()

  /**
   * Asked for by name. `assets` is undefined until the launch list has
   * arrived, which leaves this request unmade rather than briefly asking for
   * every asset on the network.
   */
  const { assets, isLoading: assetsLoading } = useAssets({
    timeframe,
    limit: MAX_ROWS,
    includeHidden: true,
    assets: launchesLoading ? undefined : names,
  })

  /**
   * The LAUNCH list drives the rows, not the asset response.
   *
   * An asset only enters the assets table once it has a market, a quote role
   * or a dispenser, so a launch that graduated an hour ago and has not traded
   * yet would be missing from it. Keying off the launches and looking the
   * aggregate up means such a row appears the moment it exists, with dashes
   * where there is nothing to say — which is true, and better than absent.
   */
  const byAsset = new Map<string, AssetEntry>(assets.map((a) => [a.asset, a]))
  const rows = graduated.map((l) => ({ launch: l, asset: byAsset.get(l.asset) ?? null }))
  const loading = launchesLoading || (assetsLoading && assets.length === 0)

  const totalVolume = rows.reduce((sum, r) => sum + (r.asset?.xcp_volume ?? 0), 0)
  const totalMinters = graduated.reduce((sum, l) => sum + l.minters, 0)

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="px-4 py-8">
        <BrowseHeader
          title="Launches"
          subtitle="Assets from completed XCP-69 launches — sold out, pool seeded, liquidity locked"
        >
          <TimeframePills value={timeframe} onChange={setTimeframe} />
        </BrowseHeader>

        {(loading || rows.length > 0) && (
          <StatGrid>
            <CounterCard
              label="Launched"
              loading={loading}
              value={graduated.length.toLocaleString()}
              sub="graduated to a pool"
            />
            <CounterCard
              label="Top Launch"
              loading={loading}
              value={rows[0] ? (rows[0].launch.asset_longname ?? rows[0].launch.asset) : '—'}
              sub={rows[0] ? `${rows[0].launch.minters.toLocaleString()} minters` : undefined}
            />
            <CounterCard
              label="Volume"
              loading={loading}
              value={totalVolume > 0 ? formatBig(totalVolume) : '—'}
              sub={`XCP · ${timeframe === 'all' ? 'all time' : timeframe}`}
            />
            <CounterCard
              label="Minters"
              loading={loading}
              value={totalMinters.toLocaleString()}
              // Not distinct across launches — one person can back several.
              sub={`${XCP69_MIN_MINTERS}+ required per launch`}
            />
          </StatGrid>
        )}

        {!loading && rows.length === 0 ? (
          <EmptyState error={!!error} stats={stats} />
        ) : (
          <div className="overflow-hidden rounded-sm border border-zinc-800 bg-zinc-900/50">
            <div className="overflow-x-auto">
              <table className="w-full whitespace-nowrap text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500">
                    <th className="px-3 py-2 text-left font-normal">Asset</th>
                    <th className="px-3 py-2 text-right font-normal">Price</th>
                    <th className="px-3 py-2 text-right font-normal">
                      {timeframe === 'all' ? 'Volume (XCP)' : `${timeframe} volume (XCP)`}
                    </th>
                    <th className="px-3 py-2 text-right font-normal">Trades</th>
                    <th className="px-3 py-2 text-right font-normal">Markets</th>
                    <th className="px-3 py-2 text-right font-normal">Minters</th>
                    <th className="px-3 py-2 text-right font-normal max-sm:hidden">Last trade</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ launch, asset }) => (
                    <LaunchRow key={launch.tx_hash} launch={launch} asset={asset} timeframe={timeframe} />
                  ))}
                  {loading && rows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-zinc-500">
                        Loading launches…
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

/**
 * Nothing has graduated yet.
 *
 * Says what is happening instead of explaining the rules. A visitor who has
 * never heard of XCP-69 does not want a paragraph defining it; they want to
 * know whether anything is going on, and a live number answers that in one
 * line. The rules are one click away, on the site that enforces them.
 */
/**
 * Nothing has graduated yet.
 *
 * Says what is happening instead of explaining the rules. Someone who has
 * never heard of XCP-69 does not want a paragraph defining it; they want to
 * know whether anything is going on, and a live number answers that in a
 * line. The rules are one click away, on the site that enforces them.
 */
function EmptyState({ error, stats }: { error: boolean; stats: LaunchStats | null }) {
  if (error) {
    return (
      <Shell>
        <p className="text-sm text-zinc-400">Could not reach the launch index.</p>
      </Shell>
    )
  }
  const minters = stats?.activity.minters ?? 0
  const xcp = Math.round((stats?.activity.paid_xcp ?? 0) / 1e8)
  const open = stats?.counts.minting ?? 0

  return (
    <Shell>
      <p className="text-sm text-zinc-300">Nothing has graduated yet.</p>
      {minters > 0 && open > 0 && (
        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-zinc-500">
          <Num>{minters}</Num> addresses have committed <Num>{xcp} XCP</Num> so far,
          {/* Its own line: the sentence has two halves — who has paid, and
              what they are waiting on — and the break is where it turns. */}
          <br />
          across <Num>{open}</Num> launches minting right now.
        </p>
      )}
      <a
        href={XCP_FUN_BASE}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-5 inline-block rounded-sm bg-purple-600 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-50 transition-colors hover:bg-purple-500"
      >
        Mint on xcp.fun ↗
      </a>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-sm border border-zinc-800 bg-zinc-900/50 px-6 py-16 text-center">
      {children}
    </div>
  )
}

function Num({ children }: { children: React.ReactNode }) {
  return <span className="font-mono tabular-nums text-zinc-300">{children}</span>
}

function LaunchRow({
  launch: l,
  asset: a,
  timeframe,
}: {
  launch: Launch
  asset: AssetEntry | null
  timeframe: string
}) {
  const label = l.asset_longname ?? l.asset
  const dash = <span className="text-zinc-600">—</span>

  return (
    <tr className="border-b border-zinc-800/30 transition-colors last:border-0 hover:bg-zinc-800/50">
      <td className="px-3 py-2">
        <Link
          href={`/${encodeURIComponent(label)}`}
          className="flex items-center gap-1.5 font-medium text-zinc-200 hover:text-green-400"
        >
          <Image
            src={`${XCP_IMG_BASE}/icon/${l.asset}`}
            alt=""
            width={14}
            height={14}
            className="rounded-sm"
            sizes="14px"
            unoptimized
          />
          <span className="max-w-[16rem] truncate">{label}</span>
        </Link>
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums">
        {a?.top_price != null && a.top_pair ? (
          <Link href={marketPath(a.top_pair)} className="text-zinc-300 hover:text-green-400">
            {formatAmount(a.top_price)} <span className="text-zinc-500">{a.top_quote}</span>
          </Link>
        ) : (
          dash
        )}
        {a?.top_price_change != null && timeframe !== 'all' && (
          <span className={`ml-1.5 ${pctColor(a.top_price_change)}`}>{formatPct(a.top_price_change)}</span>
        )}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-zinc-300">
        {a && a.xcp_volume > 0 ? formatBig(a.xcp_volume) : dash}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-zinc-400">
        {a && a.trade_count > 0 ? a.trade_count.toLocaleString() : dash}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-zinc-400">
        {a && a.market_count > 0 ? a.market_count : dash}
      </td>
      {/* The one launch-specific column worth keeping: how many people it took
          to get here. It is the standard's actual test, and no other asset on
          the site has an answer to it. */}
      <td className="px-3 py-2 text-right font-mono tabular-nums text-zinc-400">
        {l.minters.toLocaleString()}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-zinc-500 max-sm:hidden">
        {a?.last_trade_time ? formatTimeAgo(a.last_trade_time) : '—'}
      </td>
    </tr>
  )
}
