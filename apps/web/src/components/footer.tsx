import Link from 'next/link'

export function Footer() {
  return (
    <footer className="border-t border-zinc-800 bg-zinc-950 px-4 py-4">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <span className="text-xs font-bold tracking-wider text-green-500/60 font-mono">XCP DEX</span>
          <span className="text-[11px] text-zinc-600">Peer-to-peer trading on Bitcoin</span>
        </div>
        <div className="flex items-center gap-4">
          <a
            href="https://www.xcp.io"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            XCP.io
          </a>
          <a
            href="https://github.com/CounterpartyXCP"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            GitHub
          </a>
          <a
            href="https://counterparty.io"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            Docs
          </a>
        </div>
      </div>
    </footer>
  )
}
