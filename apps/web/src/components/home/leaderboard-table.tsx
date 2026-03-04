'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { TogglePills } from './toggle-pills'
import { XCP_IMG_BASE } from '@/utils/constants'

export interface LeaderboardRow {
  key: string
  href: string
  icon?: string
  label: string
  cells: Array<{ value: string; className?: string }>
  sortValues: number[]
}

export interface LeaderboardTab {
  label: string
  headers: string[]
  rows: LeaderboardRow[]
  sortable?: boolean[]
}

export function LeaderboardTable({
  title,
  tabs,
}: {
  title: string
  tabs: [LeaderboardTab, LeaderboardTab]
}) {
  const [tabIndex, setTabIndex] = useState<0 | 1>(0)
  const [sortIndices, setSortIndices] = useState<[number, number]>([0, 0])
  const active = tabs[tabIndex]
  const sortIndex = sortIndices[tabIndex]

  const sorted = useMemo(() => {
    const idx = sortIndex
    return [...active.rows].sort((a, b) => (b.sortValues[idx] ?? 0) - (a.sortValues[idx] ?? 0)).slice(0, 10)
  }, [active.rows, sortIndex])

  const handleSort = (cellIdx: number) => {
    setSortIndices((prev) => {
      const next: [number, number] = [...prev]
      next[tabIndex] = cellIdx
      return next
    })
  }

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm">
      <div className="px-3 py-2 flex items-center gap-2">
        <span className="text-xs text-zinc-500">{title}</span>
        <div className="ml-auto">
          <TogglePills
            options={[0, 1] as const}
            value={tabIndex}
            onChange={setTabIndex}
            label={(i) => tabs[i].label}
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs whitespace-nowrap">
          <thead>
            <tr className="text-zinc-500 border-b border-zinc-800">
              <th className="text-left font-normal px-3 py-1.5 w-6">#</th>
              <th className="text-left font-normal px-3 py-1.5">{active.headers[0]}</th>
              {active.headers.slice(1).map((h, i) => {
                const isSortable = active.sortable ? active.sortable[i] : true
                const isActive = sortIndex === i
                return (
                  <th
                    key={h}
                    className={`text-right font-normal px-3 py-1.5${isSortable ? ' cursor-pointer select-none hover:text-zinc-400' : ''}${isActive ? ' text-zinc-300' : ''}`}
                    onClick={isSortable ? () => handleSort(i) : undefined}
                  >
                    {h} {isActive ? '\u25BC' : ''}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr key={row.key} className="hover:bg-zinc-800/50 transition-colors border-b border-zinc-800/30 last:border-0">
                <td className="px-3 py-1.5 text-zinc-500">{i + 1}</td>
                <td className="px-3 py-1.5">
                  <Link href={row.href} className="flex items-center gap-1.5 hover:underline">
                    {row.icon && (
                      <Image
                        src={`${XCP_IMG_BASE}/icon/${row.icon}`}
                        alt=""
                        width={14}
                        height={14}
                        className="rounded-sm"
                        sizes="14px"
                      />
                    )}
                    <span className="text-zinc-200">{row.label}</span>
                  </Link>
                </td>
                {row.cells.map((cell, j) => (
                  <td key={j} className={`text-right font-mono px-3 py-1.5 ${cell.className ?? 'text-zinc-400'}`}>
                    {cell.value}
                  </td>
                ))}
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={active.headers.length + 1} className="text-center py-6 text-zinc-500">
                  No data
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
