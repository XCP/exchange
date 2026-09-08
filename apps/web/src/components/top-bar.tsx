'use client'

import Link from 'next/link'
import { RiTerminalBoxLine, RiGasStationFill, RiSettings3Line } from 'react-icons/ri'
import { TopNav } from '@/components/top-nav'
import { SearchPalette } from '@/components/search-palette'
import { WalletButton } from '@/components/wallet-button'
import { useBtcPrice, useXcpPrice, useFeeRate } from '@/lib/hooks/useNetworkInfo'
import { useSatsMode } from '@/lib/sats-context'
import { useDisplayPreferences } from '@/lib/display-preferences'

export function TopBar() {
  const { fiat, displayText } = useDisplayPreferences()
  const btcPrice = useBtcPrice()
  const { xcpUsd } = useXcpPrice()
  // The same hook every form calls for its default rate. Same SWR key means
  // the header shares their request rather than adding one — see useFeeRate.
  const feeRate = useFeeRate()
  const { satsMode, toggleSatsMode } = useSatsMode()

  return (
    <header className="sticky top-0 z-50 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 sm:gap-4 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-sm px-4 py-2">
      <div className="flex items-center gap-3 sm:gap-6 max-sm:w-full max-sm:justify-between">
        <Link href="/" className="flex items-center gap-2.5 text-sm font-bold tracking-wider text-green-500 font-mono">
          <RiTerminalBoxLine className="text-lg relative" style={{ color: '#c8b898', top: '-0.5px' }} />
          <span className="hidden sm:inline">XCP DEX</span>
        </Link>
        <TopNav />
      </div>

      <SearchPalette />

      <div className="flex items-center gap-3 sm:gap-5">
        {/* The two tickers were the only numbers on the site that showed a
            price and went nowhere. Both are the denominators everything else
            is quoted in, so they get the page /ASSET gives every other one. */}
        <Link href="/price/BTC" className="hidden md:flex items-center gap-2 group">
          <span className="text-xs text-zinc-500 group-hover:text-zinc-400">BTC</span>
          <span className="text-xs text-zinc-300 font-mono group-hover:text-zinc-100">
            {btcPrice != null ? fiat(btcPrice) : '—'}
          </span>
        </Link>
        <Link href="/price/XCP" className="hidden md:flex items-center gap-2 group">
          <span className="text-xs text-zinc-500 group-hover:text-zinc-400">XCP</span>
          <span className="text-xs text-zinc-300 font-mono group-hover:text-zinc-100">
            {xcpUsd != null ? fiat(xcpUsd) : '—'}
          </span>
        </Link>
        <button
          onClick={toggleSatsMode}
          className="hidden md:flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider border border-zinc-700 hover:border-zinc-500 transition-colors"
          title={satsMode ? 'Switch to BTC' : 'Switch to sats'}
        >
          <span className={satsMode ? 'text-zinc-500' : 'text-orange-400'}>BTC</span>
          <span className="text-zinc-600">/</span>
          <span className={satsMode ? 'text-orange-400' : 'text-zinc-500'}>SATS</span>
        </button>
        {/* The network rate, not whatever fee this browser has saved in its
            form settings. It sits with BTC and XCP because it is the third
            number the network charges you, and like them it belongs to the
            chain rather than to you. */}
        <a
          href="https://mempool.space"
          target="_blank"
          rel="noopener noreferrer"
          title="Next-block fee rate — the default every form composes at"
          className="hidden md:flex items-center gap-1.5 group"
        >
          {/* Filled rather than outlined: at 14px the outline pump loses its
              nozzle and reads as a blank box. */}
          <RiGasStationFill className="text-sm text-zinc-500 group-hover:text-zinc-400" />
          <span className="text-xs text-zinc-300 font-mono group-hover:text-zinc-100">
            {feeRate != null ? `${displayText(String(feeRate))} sat/vB` : '—'}
          </span>
        </a>
        <div className="h-4 w-px bg-zinc-800 hidden sm:block" />
        <WalletButton />
        <Link href="/settings" aria-label="Display settings" title="Display settings" className="text-zinc-500 hover:text-zinc-100"><RiSettings3Line className="size-4" /></Link>
      </div>
    </header>
  )
}
