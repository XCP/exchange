'use client'

import { useState } from 'react'
import type { AnalyticsTopTrader } from '@/lib/hooks/useAnalytics'
import { TogglePills } from './toggle-pills'
import { formatBig } from '@/utils/format-analytics'

export function TopTradersTable({
  title,
  unit,
  tabLabels,
  listA,
  listB,
  titleExtra,
}: {
  title: string
  unit: string
  tabLabels: [string, string]
  listA: AnalyticsTopTrader[]
  listB: AnalyticsTopTrader[]
  titleExtra?: React.ReactNode
}) {
  const [tab, setTab] = useState<0 | 1>(0)
  const [sortBy, setSortBy] = useState<'volume' | 'trades'>('volume')
  const raw = tab === 0 ? listA : listB
  const list = [...raw].sort((a, b) => b[sortBy] - a[sortBy])

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm">
      <div className="px-3 py-2 flex items-center gap-2">
        <span className="text-xs text-zinc-500">{title}</span>
        {titleExtra}
        <div className="ml-auto">
          <TogglePills
            options={[0, 1] as const}
            value={tab}
            onChange={setTab}
            label={(i) => tabLabels[i]}
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs whitespace-nowrap">
          <thead>
            <tr className="text-zinc-500 border-b border-zinc-800">
              <th className="text-left font-normal px-3 py-1.5">#</th>
              <th className="text-left font-normal px-3 py-1.5">Address</th>
              <th
                className={`text-right font-normal px-3 py-1.5 cursor-pointer select-none hover:text-zinc-400 ${sortBy === 'volume' ? 'text-zinc-300' : ''}`}
                onClick={() => setSortBy('volume')}
              >
                Volume ({unit}) {sortBy === 'volume' ? '\u25BC' : ''}
              </th>
              <th
                className={`text-right font-normal px-3 py-1.5 cursor-pointer select-none hover:text-zinc-400 ${sortBy === 'trades' ? 'text-zinc-300' : ''}`}
                onClick={() => setSortBy('trades')}
              >
                Trades {sortBy === 'trades' ? '\u25BC' : ''}
              </th>
            </tr>
          </thead>
          <tbody>
            {list.map((t, i) => (
              <tr key={t.address} className="hover:bg-zinc-800/50 transition-colors border-b border-zinc-800/30 last:border-0">
                <td className="px-3 py-1.5 text-zinc-500">{i + 1}</td>
                <td className="px-3 py-1.5 text-zinc-300 font-mono text-[11px] break-all">
                  <span className="hidden md:inline">{t.address}</span>
                  <span className="md:hidden">{t.address.slice(0, 6)}...{t.address.slice(-4)}</span>
                </td>
                <td className="text-right text-zinc-400 font-mono px-3 py-1.5">{formatBig(t.volume)}</td>
                <td className="text-right text-zinc-400 font-mono px-3 py-1.5">{t.trades.toLocaleString()}</td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td colSpan={4} className="text-center py-6 text-zinc-500">No data</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
