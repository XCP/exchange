'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useWallet } from '@/lib/wallet/wallet-context'
import { formatAddress } from '@/utils/format-address'
import { WalletInstallModal } from '@/components/wallet-install-modal'

export function WalletButton() {
  const { status, address, connecting, connect, disconnect } = useWallet()
  const [open, setOpen] = useState(false)
  const [showInstall, setShowInstall] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (status === 'not_detected') {
    return (
      <>
        <button
          onClick={() => {
            // Re-check in case the extension injected after the 2s detection window.
            if (window.xcpwallet) {
              connect()
            } else {
              setShowInstall(true)
            }
          }}
          className="rounded-sm border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs font-medium text-green-400 hover:bg-green-500/20 transition-colors"
        >
          Connect
        </button>
        {showInstall && <WalletInstallModal onClose={() => setShowInstall(false)} />}
      </>
    )
  }

  if (status === 'disconnected') {
    return (
      <button
        onClick={connect}
        disabled={connecting}
        className="rounded-sm border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs font-medium text-green-400 hover:bg-green-500/20 transition-colors disabled:opacity-50"
      >
        {connecting ? 'Connecting...' : 'Connect'}
      </button>
    )
  }

  // Connected
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-sm border border-zinc-700 px-2.5 py-1 hover:border-zinc-500 transition-colors"
      >
        <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
        <span className="text-xs text-zinc-300 font-mono">{formatAddress(address!)}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-44 rounded-sm border border-zinc-700 bg-zinc-900 shadow-lg z-50">
          <Link
            href="/portfolio"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            Portfolio
          </Link>
          <div className="border-t border-zinc-800" />
          <button
            onClick={() => { disconnect(); setOpen(false) }}
            className="block w-full px-3 py-2 text-left text-xs text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  )
}
