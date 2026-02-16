import BigNumber from 'bignumber.js'
import { formatCommas } from '@/utils/format-commas'
import { QUOTE_ASSETS, QUOTE_KEYWORDS } from '@/utils/constants'
import type { AssetInfo, Order } from '@/types/trading'

export const getQuoteRank = (symbol: string): number => {
  const index = QUOTE_ASSETS.indexOf(symbol)
  return index !== -1 ? index : QUOTE_ASSETS.length
}

const isQuoteAssetDirect = (symbol: string): boolean => {
  return QUOTE_ASSETS.includes(symbol)
}

const isQuoteAssetFallback = (symbol: string): boolean => {
  return QUOTE_KEYWORDS.some(keyword => symbol.toUpperCase().includes(keyword))
}

const getAssetSymbol = (assetInfo: AssetInfo, fallback: string): string => {
  return assetInfo.asset_longname ? assetInfo.asset_longname : fallback
}

export function assetsToTradingPairFromSymbols(giveSymbol: string, getSymbol: string): [string, string] {
  let baseSymbol: string, quoteSymbol: string

  if (isQuoteAssetDirect(giveSymbol) && isQuoteAssetDirect(getSymbol)) {
    ;[baseSymbol, quoteSymbol] = getQuoteRank(giveSymbol) < getQuoteRank(getSymbol) ? [getSymbol, giveSymbol] : [giveSymbol, getSymbol]
  } else if (isQuoteAssetDirect(giveSymbol)) {
    ;[baseSymbol, quoteSymbol] = [getSymbol, giveSymbol]
  } else if (isQuoteAssetDirect(getSymbol)) {
    ;[baseSymbol, quoteSymbol] = [giveSymbol, getSymbol]
  } else if (isQuoteAssetFallback(giveSymbol) && isQuoteAssetFallback(getSymbol)) {
    ;[baseSymbol, quoteSymbol] = getQuoteRank(giveSymbol) < getQuoteRank(getSymbol) ? [getSymbol, giveSymbol] : [giveSymbol, getSymbol]
  } else if (isQuoteAssetFallback(giveSymbol)) {
    ;[baseSymbol, quoteSymbol] = [getSymbol, giveSymbol]
  } else if (isQuoteAssetFallback(getSymbol)) {
    ;[baseSymbol, quoteSymbol] = [giveSymbol, getSymbol]
  } else {
    ;[baseSymbol, quoteSymbol] = giveSymbol < getSymbol ? [giveSymbol, getSymbol] : [getSymbol, giveSymbol]
  }

  return [baseSymbol, quoteSymbol]
}

export function getTradingPairSlugFromSymbols(giveSymbol: string, getSymbol: string): string {
  const [base, quote] = assetsToTradingPairFromSymbols(giveSymbol, getSymbol)
  return `${base}_${quote}`
}

export function assetsToTradingPair(order: Order, useRawAssets: boolean = false): [string, string] {
  const giveSymbol = getAssetSymbol(order.give_asset_info, order.give_asset)
  const getSymbol = getAssetSymbol(order.get_asset_info, order.get_asset)

  let baseSymbol: string, quoteSymbol: string

  if (isQuoteAssetDirect(giveSymbol) && isQuoteAssetDirect(getSymbol)) {
    ;[baseSymbol, quoteSymbol] = getQuoteRank(giveSymbol) < getQuoteRank(getSymbol) ? [getSymbol, giveSymbol] : [giveSymbol, getSymbol]
  } else if (isQuoteAssetDirect(giveSymbol)) {
    ;[baseSymbol, quoteSymbol] = [getSymbol, giveSymbol]
  } else if (isQuoteAssetDirect(getSymbol)) {
    ;[baseSymbol, quoteSymbol] = [giveSymbol, getSymbol]
  } else if (isQuoteAssetFallback(giveSymbol) && isQuoteAssetFallback(getSymbol)) {
    ;[baseSymbol, quoteSymbol] = getQuoteRank(giveSymbol) < getQuoteRank(getSymbol) ? [getSymbol, giveSymbol] : [giveSymbol, getSymbol]
  } else if (isQuoteAssetFallback(giveSymbol)) {
    ;[baseSymbol, quoteSymbol] = [getSymbol, giveSymbol]
  } else if (isQuoteAssetFallback(getSymbol)) {
    ;[baseSymbol, quoteSymbol] = [giveSymbol, getSymbol]
  } else {
    ;[baseSymbol, quoteSymbol] = giveSymbol < getSymbol ? [giveSymbol, getSymbol] : [getSymbol, giveSymbol]
  }

  if (useRawAssets) {
    return (baseSymbol === giveSymbol) ? [order.give_asset, order.get_asset] : [order.get_asset, order.give_asset]
  }

  return [baseSymbol, quoteSymbol]
}

export function getTradingPairSlug(order: Order): string {
  const [base, quote] = assetsToTradingPair(order)
  return `${base}_${quote}`
}

export function getTradingPairString(order: Order): string {
  const [base, quote] = assetsToTradingPair(order)
  return `${base}/${quote}`
}

export function getBaseAssetString(order: Order): string {
  const [base] = assetsToTradingPair(order)
  return base
}

export function getQuoteAssetString(order: Order): string {
  const [, quote] = assetsToTradingPair(order)
  return quote
}

export function getTradingDirection(order: Order): 'buy' | 'sell' {
  const [, quote] = assetsToTradingPair(order, true)
  return order.give_asset === quote ? 'buy' : 'sell'
}

export function calculatePrice(order: Order): string {
  const [baseSymbol, quoteSymbol] = assetsToTradingPair(order)
  const baseQuantity = new BigNumber(order.give_asset === baseSymbol ? order.give_quantity_normalized : order.get_quantity_normalized)
  const quoteQuantity = new BigNumber(order.give_asset === quoteSymbol ? order.give_quantity_normalized : order.get_quantity_normalized)
  const price = quoteQuantity.dividedBy(baseQuantity)
  return formatCommas(price.toFixed(8))
}

export function calculatePricePlain(order: Order): string {
  const [baseSymbol, quoteSymbol] = assetsToTradingPair(order)
  const baseQuantity = new BigNumber(order.give_asset === baseSymbol ? order.give_quantity_normalized : order.get_quantity_normalized)
  const quoteQuantity = new BigNumber(order.give_asset === quoteSymbol ? order.give_quantity_normalized : order.get_quantity_normalized)
  const price = quoteQuantity.dividedBy(baseQuantity)
  return price.toFixed(8)
}

export function calculateAmount(order: Order): string {
  const [baseSymbol] = assetsToTradingPair(order)
  const baseQuantity = new BigNumber(
    order.status === 'open'
      ? order.give_asset === baseSymbol
        ? order.give_remaining_normalized
        : order.get_remaining_normalized
      : order.give_asset === baseSymbol
      ? order.give_quantity_normalized
      : order.get_quantity_normalized
  )
  return formatCommas(baseQuantity.toFixed(8))
}

export function calculateTotal(order: Order): string {
  const [, quoteSymbol] = assetsToTradingPair(order)
  const quoteQuantity = new BigNumber(order.give_asset === quoteSymbol ? order.give_quantity_normalized : order.get_quantity_normalized)
  return formatCommas(quoteQuantity.toFixed(8))
}
