import BigNumber from 'bignumber.js'
import { fromBase } from '@/utils/numeric'
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

const getAssetSymbol = (assetInfo: AssetInfo | undefined, fallback: string): string => {
  return assetInfo?.asset_longname || fallback
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

/** Scale each raw leg with that leg's metadata, never with the quote asset's scale. */
function legQuantity(order: Order, leg: 'give' | 'get', remaining = false): string {
  return fromBase(order[`${leg}_${remaining ? 'remaining' : 'quantity'}`], order[`${leg}_asset_info`]?.divisible)
}

export function calculatePricePlain(order: Order): string {
  // Raw asset IDs select the leg; a subasset display name does not equal its A-name.
  const [baseSymbol] = assetsToTradingPair(order, true)
  const baseLeg = order.give_asset === baseSymbol ? 'give' : 'get'
  const base = new BigNumber(legQuantity(order, baseLeg))
  const quote = new BigNumber(legQuantity(order, baseLeg === 'give' ? 'get' : 'give'))
  return base.isPositive() && quote.isFinite() ? quote.dividedBy(base).toFixed(8) : ''
}

export function calculatePrice(order: Order): string {
  const price = calculatePricePlain(order)
  return price ? formatCommas(price) : '—'
}

export function calculateAmountPlain(order: Order): string {
  const [baseSymbol] = assetsToTradingPair(order, true)
  return legQuantity(order, order.give_asset === baseSymbol ? 'give' : 'get', order.status === 'open')
}

export function calculateAmount(order: Order): string {
  const amount = calculateAmountPlain(order)
  return amount ? formatCommas(amount) : '—'
}

export function calculateTotal(order: Order): string {
  const [, quoteSymbol] = assetsToTradingPair(order, true)
  const total = legQuantity(order, order.give_asset === quoteSymbol ? 'give' : 'get', order.status === 'open')
  return total ? formatCommas(total) : '—'
}
