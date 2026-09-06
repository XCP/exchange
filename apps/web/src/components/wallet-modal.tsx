'use client'

import { createPortal } from 'react-dom'
import Image from 'next/image'
import type { WalletChooserState } from '@xcp/wallet-sdk/react'

/**
 * Store links when no wallet is installed, a choice when more than one is.
 * Every supported wallet is listed either way, recommended first.
 */
export function WalletModal({ chooser }: { chooser: WalletChooserState }) {
  const installing = chooser.action === 'install'
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60" onClick={chooser.close}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-5 max-w-sm w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-500/10 border border-green-500/20">
            <svg className="h-5 w-5 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="6" width="20" height="12" rx="2" />
              <path d="M12 12h.01" />
              <path d="M17 12h.01" />
              <path d="M7 12h.01" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">{installing ? 'Wallet Required' : 'Choose a Wallet'}</h3>
            <p className="text-xs text-zinc-400 mt-1">
              {installing
                ? 'Install a Counterparty wallet extension to trade on the DEX.'
                : 'More than one wallet is installed. Pick the one to connect with.'}
            </p>
          </div>
        </div>
        <ul className="space-y-2">
          {chooser.candidates.map((wallet, index) => (
            <li key={wallet.id} className="flex items-center gap-3 rounded-sm border border-zinc-800 px-3 py-2">
              {wallet.icon ? (
                <Image src={wallet.icon} alt="" width={28} height={28} className="h-7 w-7 rounded-md" unoptimized />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-800 text-xs text-zinc-300">
                  {wallet.name.charAt(0)}
                </span>
              )}
              <span className="flex-1 text-xs text-zinc-200">
                {wallet.name}
                {index === 0 && (
                  <span className="ml-2 text-[10px] uppercase tracking-wide text-green-400">Recommended</span>
                )}
              </span>
              {wallet.installed ? (
                <button
                  onClick={() => void chooser.choose(wallet.id)}
                  className="rounded-sm border border-green-500/30 bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-400 hover:bg-green-500/20 transition-colors"
                >
                  Connect
                </button>
              ) : (
                <a
                  href={wallet.installUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-sm border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:border-zinc-500 transition-colors"
                >
                  Install
                </a>
              )}
            </li>
          ))}
        </ul>
        <button
          onClick={chooser.close}
          className="w-full mt-2 py-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>,
    document.body,
  )
}
