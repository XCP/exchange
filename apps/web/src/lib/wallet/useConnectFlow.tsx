'use client'

import { useState } from 'react'
import { useWallet } from '@/lib/wallet/wallet-context'
import { WalletInstallModal } from '@/components/wallet-install-modal'

/**
 * The one way to ask someone to connect a wallet.
 *
 * There were five, and they disagreed about the case that matters most —
 * a visitor with no extension installed:
 *
 *  - `status === 'disconnected' ? connect : setShowInstall(true)` (×4)
 *  - `await connect(); if (!window.xcpwallet) setShowInstall(true)`
 *  - `try { await connect() } catch { setShowInstall(true) }`
 *  - `onConnect={connect}` with no install path at all (×2) — which is a dead
 *    button for exactly the people it most needed to help: `connect()` sets
 *    connectError, and nothing but ConnectCTA has ever rendered that.
 *
 * The rules this settles, taken from ConnectCTA, which had them right:
 *
 *  - Detection happens at CLICK time, not mount time. A late-injecting
 *    extension is normal on a cold browser start, and a button that decided
 *    at mount would send an installed user to the Chrome Web Store.
 *  - No extension means the install modal, never a silent failure.
 *  - A connection that fails for any other reason surfaces its error, so the
 *    button is never merely dead.
 */
export function useConnectFlow() {
  const { status, connect, connecting, connectError } = useWallet()
  const [showInstall, setShowInstall] = useState(false)

  const start = () => {
    if (typeof window !== 'undefined' && window.xcpwallet) void connect()
    else setShowInstall(true)
  }

  return {
    connected: status === 'connected',
    connecting,
    connectError,
    /** Wire to onClick. Decides between connecting and offering the install. */
    start,
    /** Render somewhere in the tree; null unless the modal is open. */
    installModal: showInstall ? (
      <WalletInstallModal onClose={() => setShowInstall(false)} />
    ) : null,
  }
}
