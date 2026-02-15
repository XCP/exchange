import Link from 'next/link'
import type { OtherMarket } from '@/types/trading'
import { formatAmount } from '@/utils/format-amount'

const EXTERNAL_QUOTES: Record<string, string> = {
  JPY: 'zaif',
  ETH: 'emblem',
  WETH: 'emblem',
  USDC: 'emblem',
}

function getExternalUrl(market: OtherMarket): string | null {
  const dest = EXTERNAL_QUOTES[market.quote_asset.symbol]
  if (!dest) return null

  const asset = market.name.split('/')[0].toLowerCase()
  if (dest === 'zaif') return `https://zaif.jp/trade/${asset}_jpy`
  if (dest === 'emblem') return 'https://emblem.finance'
  return null
}

interface MarketsTableProps {
  markets: OtherMarket[]
}

export function MarketsTable({ markets }: MarketsTableProps) {
  if (markets.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="text-xs text-zinc-600">No other markets</span>
      </div>
    )
  }

  return (
    <div>
      <div className="grid grid-cols-4 gap-0 px-3 py-1.5 text-xs text-zinc-600 border-b border-zinc-800">
        <span>Pair</span>
        <span className="text-right">Price</span>
        <span className="text-right">Mkt Cap</span>
        <span className="text-right">Last Trade</span>
      </div>
      <div className="px-1">
        {markets.map((market, i) => {
          const externalUrl = getExternalUrl(market)

          const cells = (
            <>
              <span className="text-zinc-300 font-mono">
                {market.name}
                {externalUrl && <span className="ml-1 text-zinc-600">↗</span>}
              </span>
              <span className="text-right text-zinc-400 font-mono">
                {market.last_trade_price != null ? formatAmount(market.last_trade_price) : '—'}
              </span>
              <span className="text-right text-zinc-500 font-mono">
                {market.market_cap_usd ? `$${formatAmount(market.market_cap_usd, true)}` : '—'}
              </span>
              <span className="text-right text-zinc-500 font-mono">
                {market.last_trade_date
                  ? new Date(market.last_trade_date * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : '—'}
              </span>
            </>
          )

          if (externalUrl) {
            return (
              <a
                key={`market-${i}`}
                href={externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="grid grid-cols-4 gap-0 px-2 py-1 text-xs hover:bg-zinc-900 cursor-pointer"
              >
                {cells}
              </a>
            )
          }

          return (
            <Link
              key={`market-${i}`}
              href={`/orders/${market.slug}`}
              className="grid grid-cols-4 gap-0 px-2 py-1 text-xs hover:bg-zinc-900 cursor-pointer"
            >
              {cells}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
