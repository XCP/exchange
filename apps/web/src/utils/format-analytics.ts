export function fmtBig(n: number, decimals = 2): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(decimals) + 'B'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(decimals) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  if (n >= 1) return n.toFixed(decimals)
  if (n > 0) return n.toFixed(4)
  return '0'
}

export function fmtPct(v: number | null): string {
  if (v == null) return '\u2014'
  if (v === 0) return '0.0%'
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`
}

export function pctColor(v: number | null): string {
  if (v == null || v === 0) return 'text-zinc-500'
  return v > 0 ? 'text-green-400' : 'text-red-400'
}

export function mergeDailyVolumes(
  ...sources: { timestamp: number; volume: number }[][]
): { timestamp: number; volume: number }[] {
  const buckets = new Map<number, number>()
  for (const src of sources) {
    for (const d of src) {
      buckets.set(d.timestamp, (buckets.get(d.timestamp) ?? 0) + d.volume)
    }
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([timestamp, volume]) => ({ timestamp, volume }))
}
