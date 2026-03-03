import { formatCommas } from '@/utils/format-commas'

export function formatPrice(amount: string | number, sats: boolean = false): string {
  if (amount === null || amount === undefined) {
    return 'N/A'
  }

  const num = typeof amount === 'string' ? parseFloat(amount) : amount

  if (sats) {
    const satVal = num * 1e8
    if (satVal >= 1_000_000_000) {
      return (satVal / 1_000_000_000).toFixed(2) + 'B'
    } else if (satVal >= 1_000_000) {
      return (satVal / 1_000_000).toFixed(2) + 'M'
    } else if (satVal >= 1_000) {
      return formatCommas(Math.round(satVal).toString())
    } else if (satVal >= 1) {
      return satVal.toFixed(satVal < 10 ? 2 : 0)
    } else if (satVal > 0) {
      return satVal.toPrecision(2)
    }
    return '0'
  }

  if (num >= 1_000_000_000_000_000) {
    return (num / 1_000_000_000_000_000).toFixed(2) + 'Q'
  } else if (num >= 1_000_000_000_000) {
    return (num / 1_000_000_000_000).toFixed(2) + 'T'
  } else if (num >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(2) + 'B'
  }

  let formattedNumber: string

  if (num < 1) {
    if (num > 0 && num < 0.000000005) {
      formattedNumber = num.toPrecision(2)
    } else {
      formattedNumber = num.toFixed(8)
    }
  } else {
    formattedNumber = num.toFixed(8)
  }

  return formatCommas(formattedNumber)
}
