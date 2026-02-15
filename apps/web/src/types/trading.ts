export interface AssetInfo {
  asset_longname: string | null
  description: string
  issuer: string | null
  divisible: boolean
  locked: boolean
}

export interface Order {
  tx_index: number
  tx_hash: string
  block_index: number
  source: string
  give_asset: string
  give_quantity: number
  give_remaining: number
  get_asset: string
  get_quantity: number
  get_remaining: number
  expiration: number
  expire_index: number
  status: string
  confirmed?: boolean
  block_time: number
  give_price?: number
  get_price?: number
  give_asset_info: AssetInfo & { owner?: string | null }
  get_asset_info: AssetInfo & { owner?: string | null }
  give_quantity_normalized: string
  get_quantity_normalized: string
  get_remaining_normalized: string
  give_remaining_normalized: string
  give_price_normalized?: string
  get_price_normalized?: string
}

export interface OrderMatch {
  id: string
  market_pair: string
  market_dir: string
  market_price: string
  forward_asset: string
  forward_quantity_normalized: string
  backward_asset: string
  backward_quantity_normalized: string
  block_time: number
  tx0_address: string
  tx0_hash: string
  tx0_index: number
  tx0_block_index: number
  tx1_address: string
  tx1_hash: string
  tx1_index: number
  tx1_block_index: number
  forward_quantity: number
  backward_quantity: number
  tx1_expiration: number
  match_expire_index: number
  status: string
  confirmed: boolean
  forward_asset_info: AssetInfo
  backward_asset_info: AssetInfo
}

export interface OrderBookEntry {
  price: string
  amount: string
  total: string
}

export interface Trade {
  direction: 'buy' | 'sell'
  type: string
  price: string
  price_usd?: string
  base_asset: string
  quote_asset: string
  volume: string
  link?: string
  maker?: string
  taker?: string
  tx_hash?: string
  confirmed_at: number
}

export interface TradingPairDetail {
  market_cap?: string
  market_cap_usd?: string
  volume_7d?: string
  volume_7d_usd?: string
  volume_30d?: string
  volume_30d_usd?: string
  volume_all?: string
  volume_all_usd?: string
  last_trade_type?: string
  last_trade_link?: string
  last_trade_price?: number
  last_trade_price_usd?: number
  last_trade_date?: number
  price_change_24h?: number
  high_24h?: number
  low_24h?: number
  volume_24h?: string
  base_asset: {
    asset: string
    symbol: string
    supply: number
    issued?: number
    burned?: number
    locked: boolean
    divisible: boolean
    description?: string
    issuer?: string
    asset_longname?: string | null
    block_index?: number
  }
  quote_asset: {
    asset?: string
    symbol: string
    type: string
  }
  other_markets?: OtherMarket[]
}

export interface OtherMarket {
  name: string
  slug: string
  market_cap?: string
  market_cap_usd?: string
  last_trade_type?: string
  last_trade_link?: string
  last_trade_price?: number
  last_trade_price_usd?: number
  last_trade_date?: number
  quote_asset: {
    symbol: string
  }
}

export interface OHLCCandle {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface Dispenser {
  tx_index: number
  tx_hash: string
  block_index: number
  source: string
  asset: string
  give_quantity: number
  escrow_quantity: number
  satoshirate: number
  status: number
  give_remaining: number
  oracle_address: string | null
  origin: string
  dispense_count: number
  close_block_index: number | null
  satoshi_price: number
  price: number
  price_normalized: string
  block_time: number
  asset_info: AssetInfo & { owner: string | null }
  give_quantity_normalized: string
  give_remaining_normalized: string
  escrow_quantity_normalized: string
  satoshirate_normalized: string
  satoshi_price_normalized: string
}

export interface Dispense {
  tx_index: number
  dispense_index: number
  tx_hash: string
  block_index: number
  source: string
  destination: string
  asset: string
  dispense_quantity: number
  dispenser_tx_hash: string
  btc_amount: number
  block_time: number
  asset_info: AssetInfo & { owner: string | null }
  dispense_quantity_normalized: string
  btc_amount_normalized: string
}

export interface GlobalOrderMatch {
  id: string
  tx0_index: number
  tx0_hash: string
  tx0_address: string
  tx1_index: number
  tx1_hash: string
  tx1_address: string
  forward_asset: string
  forward_quantity: number
  backward_asset: string
  backward_quantity: number
  block_index: number
  block_time: number
  status: string
  forward_asset_info: AssetInfo & { owner: string | null }
  backward_asset_info: AssetInfo & { owner: string | null }
  forward_quantity_normalized: string
  backward_quantity_normalized: string
}

export interface TradingPairSummary {
  name: string
  slug: string
  total_supply?: number
  market_cap?: string
  market_cap_usd?: string
  volume_7d?: string
  volume_7d_usd?: string
  volume_30d?: string
  volume_30d_usd?: string
  volume_all?: string
  volume_all_usd?: string
  trades_7d?: number
  trades_30d?: number
  trades_all?: number
  price_change_7d?: string
  price_change_30d?: string
  price_change_365d?: string
  last_trade_type?: string
  last_trade_link?: string
  last_trade_price?: string
  last_trade_price_usd?: string
  last_trade_date?: number
}
