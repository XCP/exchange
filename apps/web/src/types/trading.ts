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

export interface OrderBookEntry {
  price: string
  amount: string
  total: string
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

