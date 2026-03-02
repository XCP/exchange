'use client'

export function Bone({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-sm bg-zinc-800 ${className}`} />
}

export function SkeletonRows({ rows = 10, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <tr key={i} className="border-b border-zinc-800/30 last:border-0">
          {Array.from({ length: cols }, (_, j) => (
            <td key={j} className="px-3 py-1.5">
              <Bone className="h-3 w-full" />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

export function LeaderboardSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-8">
      {[0, 1].map((k) => (
        <div key={k} className="bg-zinc-900/50 border border-zinc-800 rounded-sm">
          <div className="px-3 py-2 flex items-center gap-2">
            <Bone className="h-3 w-36" />
            <div className="flex gap-0.5 ml-auto">
              <Bone className="h-5 w-14 rounded-sm" />
              <Bone className="h-5 w-20 rounded-sm" />
            </div>
          </div>
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className="text-zinc-500 border-b border-zinc-800">
                <th className="text-left font-normal px-3 py-1.5 w-6">#</th>
                <th className="text-left font-normal px-3 py-1.5">&mdash;</th>
                <th className="text-right font-normal px-3 py-1.5">&mdash;</th>
                <th className="text-right font-normal px-3 py-1.5">&mdash;</th>
              </tr>
            </thead>
            <tbody><SkeletonRows rows={10} cols={4} /></tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

export function ChartsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-8">
      {[0, 1].map((k) => (
        <div key={k} className="bg-zinc-900/50 border border-zinc-800 rounded-sm">
          <div className="px-3 py-2"><Bone className="h-3 w-32" /></div>
          <div className="px-3 pb-3" style={{ height: 280 }}>
            <div className="w-full h-full animate-pulse rounded-sm bg-zinc-800/50" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function TradersSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
      {[0, 1].map((k) => (
        <div key={k} className="bg-zinc-900/50 border border-zinc-800 rounded-sm">
          <div className="px-3 py-2 flex items-center gap-2">
            <Bone className="h-3 w-28" />
            <div className="flex gap-0.5 ml-auto">
              <Bone className="h-5 w-12 rounded-sm" />
              <Bone className="h-5 w-12 rounded-sm" />
            </div>
          </div>
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className="text-zinc-500 border-b border-zinc-800">
                <th className="text-left font-normal px-3 py-1.5 w-6">#</th>
                <th className="text-left font-normal px-3 py-1.5">&mdash;</th>
                <th className="text-right font-normal px-3 py-1.5">&mdash;</th>
                <th className="text-right font-normal px-3 py-1.5">&mdash;</th>
              </tr>
            </thead>
            <tbody><SkeletonRows rows={10} cols={4} /></tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

export function MarqueeSkeleton() {
  return (
    <div className="mb-6 bg-zinc-900/50 border border-zinc-800 rounded-sm py-2 px-3 flex gap-4">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-2 shrink-0">
          <Bone className="h-3.5 w-3.5 rounded-sm" />
          <Bone className="h-3 w-10" />
          <Bone className="h-3 w-16" />
        </div>
      ))}
    </div>
  )
}
