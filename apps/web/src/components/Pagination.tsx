interface PaginationProps {
  total: number
  offset: number
  limit: number
  onOffsetChange: (offset: number) => void
}

export function Pagination({ total, offset, limit, onOffsetChange }: PaginationProps) {
  if (total === 0) return null

  const start = offset + 1
  const end = Math.min(offset + limit, total)
  const hasPrev = offset > 0
  const hasNext = offset + limit < total

  return (
    <div className="flex items-center justify-between px-3 py-2 text-[10px] font-mono text-zinc-500">
      <span>
        {start.toLocaleString()}&ndash;{end.toLocaleString()} of {total.toLocaleString()}
      </span>
      <div className="flex gap-0.5">
        <button
          onClick={() => onOffsetChange(Math.max(0, offset - limit))}
          disabled={!hasPrev}
          className={`px-2 py-0.5 rounded-sm transition-colors ${
            hasPrev
              ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
              : 'text-zinc-700 cursor-default'
          }`}
        >
          &larr; Prev
        </button>
        <button
          onClick={() => onOffsetChange(offset + limit)}
          disabled={!hasNext}
          className={`px-2 py-0.5 rounded-sm transition-colors ${
            hasNext
              ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
              : 'text-zinc-700 cursor-default'
          }`}
        >
          Next &rarr;
        </button>
      </div>
    </div>
  )
}
