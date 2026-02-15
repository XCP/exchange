import useSWR from 'swr'
import BigNumber from 'bignumber.js'
import { fetcher } from '@/lib/api/client'
import { orderMatchesUrl } from '@/lib/api/counterparty'
import { assetsToTradingPairFromSymbols } from '@/utils/trading-pair'
import type { GlobalOrderMatch } from '@/types/trading'
import type { CounterpartyResponse } from '@/types/api'

export interface ProcessedTrade {
  price: string
  amount: string
  side: 'buy' | 'sell'
  maker: string
  taker: string
  block_time: number
  tx_hash: string
}

function processMatches(matches: GlobalOrderMatch[], baseSymbol: string, quoteSymbol: string): ProcessedTrade[] {
  return matches.map(match => {
    // Determine which side is base and which is quote
    const fwdSymbol = match.forward_asset_info?.asset_longname ?? match.forward_asset
    const bwdSymbol = match.backward_asset_info?.asset_longname ?? match.backward_asset

    const fwdIsBase = fwdSymbol === baseSymbol
    const baseQty = new BigNumber(fwdIsBase ? match.forward_quantity_normalized : match.backward_quantity_normalized)
    const quoteQty = new BigNumber(fwdIsBase ? match.backward_quantity_normalized : match.forward_quantity_normalized)

    const price = baseQty.isGreaterThan(0) ? quoteQty.dividedBy(baseQty).toFixed(8) : '0.00000000'

    // tx0 placed first (maker), tx1 matched against it (taker)
    // If maker is giving quote asset, they're buying base → trade is a buy
    const makerGivesQuote = fwdIsBase
      ? match.backward_asset === match.forward_asset ? false : true  // backward is quote
      : match.forward_asset === match.backward_asset ? false : true

    // Simpler: if forward_asset is the base, the tx0 (maker) is selling base
    const side: 'buy' | 'sell' = fwdIsBase ? 'sell' : 'buy'

    return {
      price,
      amount: baseQty.toFixed(8),
      side,
      maker: match.tx0_address,
      taker: match.tx1_address,
      block_time: match.block_time,
      tx_hash: match.tx1_hash,
    }
  })
}

export function useTrades(market: string, baseSymbol: string, quoteSymbol: string) {
  const { data, error, isLoading } = useSWR<CounterpartyResponse<GlobalOrderMatch[]>>(
    market ? orderMatchesUrl(market) : null,
    fetcher,
    { refreshInterval: 60_000 }
  )

  const trades = data?.result ? processMatches(data.result, baseSymbol, quoteSymbol) : []

  return {
    trades,
    error,
    isLoading,
  }
}
