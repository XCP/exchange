export function formatAddress(address: string | null | undefined): string {
  if (!address) return '—'
  if (address.length <= 10) {
    return address
  }
  const firstPart = address.slice(0, 6)
  const lastPart = address.slice(-4)
  return `${firstPart}...${lastPart}`
}
