'use client'

import { useState } from 'react'
import { useWallet } from '@/lib/wallet/wallet-context'
import { WalletInstallModal } from '@/components/wallet-install-modal'

interface ConnectPromptProps {
  message: string
}

export function ConnectPrompt({ message }: ConnectPromptProps) {
  const { connect, status } = useWallet()
  const [showInstall, setShowInstall] = useState(false)

  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 py-12">
      <svg className="h-8 w-8 text-zinc-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
      </svg>
      <span className="text-xs text-zinc-500">{message}</span>
      <button
        onClick={status === 'disconnected' ? connect : () => setShowInstall(true)}
        className="text-xs font-medium text-green-400 hover:text-green-300 transition-colors"
      >
        Connect Wallet
      </button>
      {showInstall && <WalletInstallModal onClose={() => setShowInstall(false)} />}
    </div>
  )
}
