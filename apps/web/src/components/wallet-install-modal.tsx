'use client'

import { createPortal } from 'react-dom'
import Image from 'next/image'

const XCP_WALLET_URL = 'https://chromewebstore.google.com/detail/xcp-wallet/nicpjdbehgcjbjfjkobcidnfmfpijohg'

interface WalletInstallModalProps {
  onClose: () => void
}

export function WalletInstallModal({ onClose }: WalletInstallModalProps) {
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60" onClick={onClose}>
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
            <h3 className="text-sm font-semibold text-zinc-100">XCP Wallet Required</h3>
            <p className="text-xs text-zinc-400 mt-1">Install the XCP Wallet Chrome extension to trade on the Counterparty DEX.</p>
          </div>
        </div>
        <a
          href={XCP_WALLET_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center w-full hover:opacity-80 transition-opacity"
        >
          <Image
            src="/chrome-web-store-badge.png"
            alt="Available in the Chrome Web Store"
            width={248}
            height={75}
            className="h-auto"
            unoptimized
          />
        </a>
        <button
          onClick={onClose}
          className="w-full mt-2 py-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>,
    document.body
  )
}
