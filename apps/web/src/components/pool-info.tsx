import Link from 'next/link'
import { formatAmount } from '@/utils/format-amount'
import { formatPrice } from '@/utils/format-price'
import type { PoolSummary } from '@/lib/hooks/usePools'

interface PoolInfoProps {
  pool: PoolSummary
  quoteSymbol: string
  bookPrice?: number | null
}

function formatApy(apy: number | null | undefined): string {
  if (apy == null || !Number.isFinite(apy)) return '—'
  return `${(apy * 100).toFixed(2)}%`
}

export function PoolInfo({ pool, quoteSymbol, bookPrice }: PoolInfoProps) {
  const baseAsset = pool.display_base_asset ?? pool.asset_a
  const quoteAsset = pool.display_quote_asset ?? pool.asset_b
  const baseReserve = pool.display_base_reserve ?? pool.reserve_a
  const quoteReserve = pool.display_quote_reserve ?? pool.reserve_b
  const poolPrice = pool.display_price
  const showBook = bookPrice != null && Number.isFinite(bookPrice) && poolPrice != null

  return (
    <div className="p-3 border-t border-zinc-800">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Pool</h3>
      <div className="space-y-2">
        <div>
          <div className="text-xs text-zinc-500">Liquidity</div>
          <div className="text-xs text-zinc-400 font-mono">{formatAmount(baseReserve)} {baseAsset}</div>
          <div className="text-xs text-zinc-400 font-mono">{formatAmount(quoteReserve)} {quoteAsset}</div>
        </div>
        <div>
          <div className="text-xs text-zinc-500">Pool price</div>
          <div className="text-xs text-zinc-400 font-mono">
            {poolPrice != null ? <>{formatPrice(poolPrice)} {quoteSymbol}</> : '—'}
            {showBook && <span className="text-zinc-600"> · book {formatPrice(bookPrice!)}</span>}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="text-xs text-zinc-500">Fee APY (30D)</div>
          <div className="text-xs text-zinc-400 font-mono">{formatApy(pool.implied_fee_apy_30d)}</div>
        </div>
        <div className="flex items-center justify-between">
          <div className="text-xs text-zinc-500">Matches</div>
          <div className="text-xs text-zinc-400 font-mono">{pool.match_count.toLocaleString()}</div>
        </div>
        <Link
          href={`/pool/${pool.lp_asset}`}
          className="block text-xs text-green-400 hover:text-green-300 transition-colors pt-1"
        >
          View pool · Add liquidity &rarr;
        </Link>
      </div>
    </div>
  )
}
