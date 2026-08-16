'use client'

import { usePathname } from 'next/navigation'

/**
 * The trading surfaces run without a footer.
 *
 * They're a single card on an otherwise empty page, and a footer under it
 * reads as the end of a document rather than the bottom of a tool — it also
 * pulls the eye away from the one thing on screen. Every other page keeps it.
 */
const NO_FOOTER = ['/swap', '/limit', '/buy', '/sell']

export function Footer() {
  const pathname = usePathname()
  if (NO_FOOTER.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null

  return (
    <footer className="border-t border-zinc-800 bg-zinc-950 px-4 py-4">
      <div className="mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <span className="text-xs font-bold tracking-wider text-green-500/60 font-mono">XCP DEX</span>
          <span className="text-[11px] text-zinc-500">Peer-to-peer trading on Bitcoin</span>
        </div>
        <div className="flex items-center gap-4">
          <a
            href="https://www.xcp.io"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-zinc-500 hover:text-zinc-400 transition-colors"
          >
            XCP.io
          </a>
          <a
            href="https://github.com/CounterpartyXCP"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-zinc-500 hover:text-zinc-400 transition-colors"
          >
            GitHub
          </a>
          <a
            href="https://counterparty.io"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-zinc-500 hover:text-zinc-400 transition-colors"
          >
            Docs
          </a>
        </div>
      </div>
    </footer>
  )
}
