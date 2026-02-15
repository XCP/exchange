'use client'

import { MarketsTable } from '@/components/markets-table'
import type { OtherMarket } from '@/types/trading'

interface MarketsModalProps {
  markets: OtherMarket[]
  asset: string
  isOpen: boolean
  onClose: () => void
}

export function MarketsModal({ markets, asset, isOpen, onClose }: MarketsModalProps) {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg mx-4 bg-zinc-950 border border-zinc-800 rounded-sm shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-100">{asset} Markets</h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[60vh] overflow-y-auto">
          <MarketsTable markets={markets} />
        </div>
      </div>
    </div>
  )
}
