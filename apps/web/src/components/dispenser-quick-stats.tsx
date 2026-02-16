import { formatPrice } from '@/utils/format-price'
import { formatAmount } from '@/utils/format-amount'
import type { DispenserStats } from '@/lib/hooks/useDispenserStats'

interface DispenserQuickStatsProps {
  stats: DispenserStats
}

export function DispenserQuickStats({ stats }: DispenserQuickStatsProps) {
  return (
    <div className="p-3 border-b border-zinc-800">
      <div className="text-xs text-zinc-500 font-medium mb-2">Dispenser Stats</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div>
          <div className="text-xs text-zinc-600">Total BTC Spent</div>
          <div className="text-xs text-zinc-300 font-mono">
            {stats.total_btc_spent != null ? formatPrice(stats.total_btc_spent) : '—'}
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-600">Total Dispenses</div>
          <div className="text-xs text-zinc-300 font-mono">
            {stats.total_dispense_count != null ? stats.total_dispense_count.toLocaleString() : '—'}
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-600">Unique Buyers</div>
          <div className="text-xs text-zinc-300 font-mono">
            {stats.unique_buyers != null ? stats.unique_buyers.toLocaleString() : '—'}
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-600">Unique Sellers</div>
          <div className="text-xs text-zinc-300 font-mono">
            {stats.unique_sellers != null ? stats.unique_sellers.toLocaleString() : '—'}
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-600">Avg BTC/Dispense</div>
          <div className="text-xs text-zinc-300 font-mono">
            {stats.avg_dispense_btc != null ? formatPrice(stats.avg_dispense_btc) : '—'}
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-600">Total Dispensed</div>
          <div className="text-xs text-zinc-300 font-mono">
            {stats.total_dispensed != null ? formatAmount(stats.total_dispensed) : '—'}
          </div>
        </div>
      </div>
    </div>
  )
}
