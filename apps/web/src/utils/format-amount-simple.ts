export function formatAmountSimple(amount: number | string): string {
  const amountStr = amount.toString()
  const [wholePart, decimalPart] = amountStr.split('.')
  const formattedWholePart = wholePart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return decimalPart ? `${formattedWholePart}.${decimalPart}` : formattedWholePart
}
