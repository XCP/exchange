'use client'

import { useState } from 'react'
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
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between gap-2 sm:gap-4 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-sm px-4 py-2">
      <div className="flex items-center gap-3 sm:gap-6">
        <Link href="/" className="flex items-center gap-2.5 text-sm font-bold tracking-wider text-green-500 font-mono">
          <RiTerminalBoxLine className="text-lg relative" style={{ color: '#c8b898', top: '-0.5px' }} />
          <span className="hidden sm:inline">XCP DEX</span>
        </Link>
        <nav className="flex items-center gap-3 sm:gap-4">
          {[
            { label: 'Trade', href: '/trade' },
            { label: 'Dispense', href: '/dispense' },
            { label: 'Pools', href: '/pool' },
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

      <SearchInput mobileOpen={mobileSearchOpen} onMobileOpenChange={setMobileSearchOpen} />

      <div className="flex items-center gap-3 sm:gap-5">
        {/* Mobile search icon */}
        <button
          className="sm:hidden flex items-center justify-center size-7 rounded-sm border border-zinc-800 bg-zinc-900 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700 transition-colors"
          onClick={() => setMobileSearchOpen(true)}
        >
          <svg className="size-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
        </button>
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
        <div className="h-4 w-px bg-zinc-800 hidden sm:block" />
        <WalletButton />
      </div>
    </header>
  )
}
