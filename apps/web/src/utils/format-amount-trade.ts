import { formatAmountSimple } from '@/utils/format-amount-simple'

export function formatAmountTrade(amount: string | number): string {
  if (amount === null || amount === undefined) {
    return 'N/A'
  }

  const num = typeof amount === 'string' ? parseFloat(amount) : amount

  if (num >= 1_000_000_000_000_000) {
    return (num / 1_000_000_000_000_000).toFixed(2) + 'Q'
  } else if (num >= 1_000_000_000_000) {
    return (num / 1_000_000_000_000).toFixed(2) + 'T'
  } else if (num >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(2) + 'B'
  }

  let formattedNumber: string

  if (num < 1) {
    const numStr = num.toString()
    const significantDigits = numStr.match(/[1-9]/)
    const significantIndex = significantDigits ? significantDigits.index! - numStr.indexOf('.') - 1 : 0

    if (significantIndex >= 8) {
      formattedNumber = num.toPrecision(2)
    } else {
      formattedNumber = num.toFixed(8)
    }
  } else {
    formattedNumber = num.toFixed(8)
  }

  return formatAmountSimple(formattedNumber)
}
