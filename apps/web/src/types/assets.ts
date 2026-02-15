export interface AssetInfo {
  asset: string
  asset_longname: string | null
  description: string
  issuer: string | null
  owner: string | null
  divisible: boolean
  locked: boolean
  supply: number
  block_index?: number
}

export interface Balance {
  address: string
  quantity: number
  quantity_normalized: string
}

export interface Holder {
  address: string
  address_name?: string
  quantity: number
  quantity_normalized: string
  percentage: number
}
