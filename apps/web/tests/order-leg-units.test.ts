import { describe, expect, it } from 'vitest'
import { calculateAmountPlain, calculatePricePlain, calculateTotal } from '@/utils/trading-pair'
import type { Order } from '@/types/trading'

const order = (change: Partial<Order> = {}) => ({
  give_asset: 'ASSET', get_asset: 'XCP', status: 'open',
  give_quantity: 100, get_quantity: 200000000, give_remaining: 25, get_remaining: 50000000,
  give_asset_info: { divisible: false, asset_longname: null },
  get_asset_info: { divisible: true, asset_longname: null },
  // Deliberately misleading normalized fields: exact raw values plus each leg's metadata win.
  give_quantity_normalized: '999', get_quantity_normalized: '999', give_remaining_normalized: '999', get_remaining_normalized: '999',
  ...change,
}) as Order

describe('order quantity units', () => {
  it('scales remaining amounts on their own give/get legs', () => {
    expect(calculateAmountPlain(order())).toBe('25')
    expect(calculateTotal(order())).toBe('0.5')
    expect(calculatePricePlain(order())).toBe('0.02000000')
    const reversed = order({ give_asset: 'XCP', get_asset: 'ASSET', give_quantity: 200000000, get_quantity: 100, give_remaining: 50000000, get_remaining: 25, give_asset_info: { divisible: true, asset_longname: null } as Order['give_asset_info'], get_asset_info: { divisible: false, asset_longname: null } as Order['get_asset_info'] })
    expect(calculateAmountPlain(reversed)).toBe('25')
    expect(calculateTotal(reversed)).toBe('0.5')
    expect(calculatePricePlain(reversed)).toBe('0.02000000')
  })
  it('does not assume the quote is XCP or divisible', () => {
    const mixed = order({ get_asset: 'ZQUOTE', give_asset_info: { divisible: true, asset_longname: null } as Order['give_asset_info'], get_asset_info: { divisible: false, asset_longname: null } as Order['get_asset_info'] })
    expect(calculateAmountPlain(mixed)).toBe('0.00000025')
    expect(calculateTotal(mixed)).toBe('50,000,000')
  })
  it('selects subasset legs using raw IDs and blocks unknown divisibility', () => {
    const subasset = order({ give_asset: 'A123456789123456789', give_asset_info: { divisible: false, asset_longname: 'PARENT.child' } as Order['give_asset_info'] })
    expect(calculateAmountPlain(subasset)).toBe('25')
    expect(calculatePricePlain(subasset)).toBe('0.02000000')
    expect(calculateAmountPlain(order({ give_asset_info: undefined }))).toBe('')
  })
})
