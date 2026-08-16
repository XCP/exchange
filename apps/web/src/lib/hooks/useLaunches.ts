import useSWR from 'swr'
import { fetcher } from '@/lib/api/client'
import { XCP_FUN_API_BASE } from '@/utils/constants'

/**
 * XCP-69 launches, read from xcp.fun's indexer rather than derived here.
 *
 * XCP-69 is a fixed-parameter launch standard built on Counterparty's
 * `fairmint_pool` feature (mainnet from block 961,100). There is no on-chain
 * marker for it — conformance is exact field equality against the fairminter
 * record, so in principle we could test it ourselves against Counterparty's
 * own /v2/fairminters list.
 *
 * Two clauses make that a bad trade:
 *
 *  1. **Pre-announcement.** A launch must confirm strictly BEFORE its
 *     start_block, which is what makes the announcement window provably
 *     mint-proof. Core rewrites `block_index` to the opening block the moment
 *     minting starts, so for anything past `pending` the original is only in
 *     the NEW_FAIRMINTER event — one request per launch, per render.
 *  2. **Participation.** Mints and distinct minters are the numbers that say
 *     whether a launch is real (69 addresses minimum, by construction), and
 *     counting them means walking every fairmint. That is an indexer's job.
 *
 * xcp.fun's worker already does both on a block-paced cron and serves the
 * verdict pre-computed with a 60s edge cache. Re-deriving it here would be a
 * second, worse copy of someone else's answer — and a copy that could disagree
 * with the site that issued the standard.
 *
 * This site shows GRADUATED launches only, and has no mint surface at all.
 * Minting is a fairminter flow — compose, escrow, soft-cap refunds — and
 * xcp.fun already runs it end to end. What we add is the part we are good at:
 * what the asset trades like once it exists. Everything before that is a link.
 *
 * See launchpad/docs/xcp-69.md for the standard, and packages/xcp69 for the
 * conformance predicate this endpoint applies.
 */

/** Lifecycle, as the indexer classifies it. */
export type LaunchPhase = 'scheduled' | 'minting' | 'graduated' | 'refunded'

export interface Launch {
  tx_hash: string
  tx_index: number
  asset: string
  asset_longname: string | null
  source: string
  divisible: number
  /** Block the launch confirmed in — the announcement, preserved past `pending`. */
  announce_block: number | null
  start_block: number
  /** Rewritten to the settlement block once a launch fills; see the standard. */
  current_deadline_block: number
  description: string | null
  lp_asset: string | null
  status: string
  phase: LaunchPhase
  /** Base units minted so far. Null before the first mint. */
  earned_quantity: string | null
  /** XCP satoshis taken in so far. */
  paid_quantity: string | null
  mints: number
  minters: number
  pool_xcp_reserve: string | null
  pool_token_reserve: string | null
}

interface LaunchesResponse {
  result: Launch[]
  result_count: number
}

/**
 * Every conforming launch. `per_phase` is capped at 50 upstream, and the
 * standard is young enough that 4 × 50 covers the whole set several times
 * over — one request, filtered in the browser, rather than a request per tab.
 */
const PER_PHASE = 50

export function useLaunches() {
  const { data, error, isLoading } = useSWR<LaunchesResponse>(
    `${XCP_FUN_API_BASE}/v2/launches?per_phase=${PER_PHASE}`,
    fetcher,
    // The upstream is block-paced: nothing here can change faster than a
    // Bitcoin block, and its own edge cache is 60s.
    { revalidateOnFocus: false, refreshInterval: 120_000, dedupingInterval: 60_000 },
  )
  return {
    launches: data?.result ?? [],
    total: data?.result_count ?? 0,
    error,
    isLoading,
  }
}

/* ------------------------------------------------------------------ *
 * The standard's fixed constants. Mirrored, not imported: xcp.fun is a
 * separate deployment, and these are frozen by consensus — a launch that
 * differs on any of them is not XCP-69 and never appears in this list.
 * ------------------------------------------------------------------ */

/** 69,000,000 tokens — the public sale, and the whole of it. */
export const XCP69_SOFT_CAP = 6_900_000_000_000_000
/** 690 XCP raised on a sell-out. Exact: mints are whole 1,000-token lots. */
export const XCP69_RAISE_XCP = 690
/** 10 XCP max per address ⇒ at least 69 distinct addresses must take part. */
export const XCP69_MIN_MINTERS = 69

/** How much of the 69M public sale is spoken for, in [0, 1]. */
export function launchProgress(l: Launch): number {
  const earned = Number(l.earned_quantity ?? 0)
  if (!Number.isFinite(earned) || earned <= 0) return 0
  return Math.min(1, earned / XCP69_SOFT_CAP)
}

/** XCP raised so far. */
export function launchRaised(l: Launch): number {
  return Number(l.paid_quantity ?? 0) / 1e8
}

/**
 * Site-wide launch activity, from xcp.fun's materialised totals.
 *
 * `minters` here is a DISTINCT address count — the `mint_totals` rollup, not
 * a sum of per-launch figures. That distinction is the whole reason this is a
 * second request: summing `minters` across the launch list double-counts
 * anyone who backed more than one, and the leaderboard at /v2/minters is
 * paginated so its length is a page size rather than a total.
 */
export interface LaunchStats {
  counts: Record<LaunchPhase, number>
  total: number
  activity: {
    mints: number
    /** Distinct addresses that have ever minted. */
    minters: number
    /** XCP satoshis committed, all launches, all time. */
    paid_xcp: number
    fee_sats: number
  }
}

export function useLaunchStats() {
  const { data, error, isLoading } = useSWR<{ result: LaunchStats }>(
    `${XCP_FUN_API_BASE}/v2/stats`,
    fetcher,
    // Upstream caches this for 300s to match its own cron; polling faster
    // cannot make it fresher, only re-serve the same answer.
    { revalidateOnFocus: false, refreshInterval: 300_000, dedupingInterval: 300_000 },
  )
  return { stats: data?.result ?? null, error, isLoading }
}
