'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { RiTerminalBoxLine } from 'react-icons/ri'
import { SearchInput } from '@/components/search-input'
import { WalletButton } from '@/components/wallet-button'
import { useBtcPrice, useXcpPrice } from '@/lib/hooks/useNetworkInfo'
import { useSatsMode } from '@/lib/sats-context'

export function TopBar() {
  const pathname = usePathname()
  const btcPrice = useBtcPrice()
  const { xcpUsd } = useXcpPrice()
  const { satsMode, toggleSatsMode } = useSatsMode()

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between gap-4 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-sm px-4 py-2">
      <div className="flex items-center gap-6">
        <Link href="/" className="flex items-center gap-2.5 text-sm font-bold tracking-wider text-green-500 font-mono">
          <RiTerminalBoxLine className="text-lg relative" style={{ color: '#c8b898', top: '-0.5px' }} />
          XCP DEX
        </Link>
        <nav className="hidden sm:flex items-center gap-4">
          {[
            { label: 'Trade', href: '/trade' },
            { label: 'Dispense', href: '/dispense' },
            { label: 'Analytics', href: '/analytics' },
          ].map((link) => {
            const isActive = link.href !== '#' && pathname.startsWith(link.href)
            return (
              <Link
                key={link.label}
                href={link.href}
                className={`text-xs font-medium transition-colors hover:text-zinc-100 ${isActive ? 'text-zinc-100' : 'text-zinc-500'}`}
              >
                {link.label}
              </Link>
            )
          })}
        </nav>
      </div>

      <SearchInput />

      <div className="flex items-center gap-5">
        <div className="hidden md:flex items-center gap-2">
          <span className="text-xs text-zinc-500">BTC</span>
          <span className="text-xs text-zinc-300 font-mono">
            {btcPrice != null ? `$${btcPrice.toLocaleString()}` : '—'}
          </span>
        </div>
        <div className="hidden md:flex items-center gap-2">
          <span className="text-xs text-zinc-500">XCP</span>
          <span className="text-xs text-zinc-300 font-mono">
            {xcpUsd != null ? `$${xcpUsd.toFixed(2)}` : '—'}
          </span>
        </div>
        <button
          onClick={toggleSatsMode}
          className="hidden md:flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider border border-zinc-700 hover:border-zinc-500 transition-colors"
          title={satsMode ? 'Switch to BTC' : 'Switch to sats'}
        >
          <span className={satsMode ? 'text-zinc-500' : 'text-orange-400'}>BTC</span>
          <span className="text-zinc-600">/</span>
          <span className={satsMode ? 'text-orange-400' : 'text-zinc-500'}>SATS</span>
        </button>
        <div className="h-4 w-px bg-zinc-800" />
        <WalletButton />
      </div>
    </header>
  )
}
