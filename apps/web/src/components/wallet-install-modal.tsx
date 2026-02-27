'use client'

const XCP_WALLET_URL = 'https://chromewebstore.google.com/detail/xcp-wallet/nicpjdbehgcjbjfjkobcidnfmfpijohg'

interface WalletInstallModalProps {
  onClose: () => void
}

export function WalletInstallModal({ onClose }: WalletInstallModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
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
          className="flex items-center justify-center gap-2 w-full rounded-md bg-green-500 text-zinc-950 py-2.5 text-xs font-semibold uppercase tracking-wider hover:bg-green-400 transition-colors"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C8.21 0 4.831 1.757 2.632 4.501l3.953 3.111A7.477 7.477 0 0 1 12 4.5c1.77 0 3.377.613 4.654 1.636l3.579-3.236C18.165 1.076 15.27 0 12 0Zm0 4.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15ZM1.584 8.195A11.907 11.907 0 0 0 0 12c0 1.39.237 2.725.672 3.966l4.553-2.102A7.418 7.418 0 0 1 4.5 12c0-.698.095-1.374.274-2.017l-3.19-1.788ZM12 19.5a7.477 7.477 0 0 1-5.414-2.318l-3.86 3.236C4.974 22.462 8.327 24 12 24c3.27 0 6.164-1.357 8.233-3.537l-3.579-3.236A7.453 7.453 0 0 1 12 19.5Z" />
          </svg>
          Add to Chrome
        </a>
        <button
          onClick={onClose}
          className="w-full mt-2 py-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
