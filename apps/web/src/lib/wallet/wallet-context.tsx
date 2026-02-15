'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

type WalletStatus = 'not_detected' | 'disconnected' | 'connected'

interface WalletContextValue {
  status: WalletStatus
  address: string | null
  connecting: boolean
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  signTransaction: (hex: string) => Promise<string>
  broadcastTransaction: (hex: string) => Promise<string>
}

const WalletContext = createContext<WalletContextValue | null>(null)

// Augment window with xcpwallet provider
declare global {
  interface Window {
    xcpwallet?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<any>
      on: (event: string, handler: (...args: any[]) => void) => void
      removeListener: (event: string, handler: (...args: any[]) => void) => void
    }
  }
}

const STORAGE_KEY = 'xcpdex-wallet'

function storageGet(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function storageSet(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch {}
}
function storageRemove(key: string) {
  try { localStorage.removeItem(key) } catch {}
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<WalletStatus>('not_detected')
  const [address, setAddress] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const connectingRef = useRef(false)

  // Detect wallet and auto-reconnect
  useEffect(() => {
    function onDetected() {
      setStatus((s) => (s === 'not_detected' ? 'disconnected' : s))
      // Auto-reconnect if previously connected
      if (storageGet(STORAGE_KEY)) {
        window.xcpwallet!
          .request({ method: 'xcp_accounts' })
          .then((accounts: string[]) => {
            if (accounts.length > 0) {
              setAddress(accounts[0])
              setStatus('connected')
            } else {
              storageRemove(STORAGE_KEY)
            }
          })
          .catch(() => {
            storageRemove(STORAGE_KEY)
          })
      }
    }

    if (window.xcpwallet) {
      onDetected()
    } else {
      // Wait up to 2s for extension to inject
      const handler = () => onDetected()
      window.addEventListener('xcp-wallet#initialized', handler)
      const timeout = setTimeout(() => {
        window.removeEventListener('xcp-wallet#initialized', handler)
      }, 2000)
      return () => {
        clearTimeout(timeout)
        window.removeEventListener('xcp-wallet#initialized', handler)
      }
    }
  }, [])

  // Listen for account changes / disconnects
  useEffect(() => {
    if (!window.xcpwallet) return

    const onAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        setAddress(null)
        setStatus('disconnected')
        storageRemove(STORAGE_KEY)
      } else {
        setAddress(accounts[0])
        setStatus('connected')
      }
    }

    const onDisconnect = () => {
      setAddress(null)
      setStatus('disconnected')
      storageRemove(STORAGE_KEY)
    }

    window.xcpwallet.on('accountsChanged', onAccountsChanged)
    window.xcpwallet.on('disconnect', onDisconnect)
    return () => {
      window.xcpwallet?.removeListener('accountsChanged', onAccountsChanged)
      window.xcpwallet?.removeListener('disconnect', onDisconnect)
    }
  }, [])

  const connect = async () => {
    if (!window.xcpwallet || connectingRef.current) return
    connectingRef.current = true
    setConnecting(true)
    try {
      const accounts: string[] = await window.xcpwallet.request({
        method: 'xcp_requestAccounts',
      })
      if (accounts.length > 0) {
        setAddress(accounts[0])
        setStatus('connected')
        storageSet(STORAGE_KEY, '1')
      }
    } finally {
      connectingRef.current = false
      setConnecting(false)
    }
  }

  const disconnect = async () => {
    if (window.xcpwallet) {
      try {
        await window.xcpwallet.request({ method: 'xcp_disconnect' })
      } catch {}
    }
    setAddress(null)
    setStatus('disconnected')
    storageRemove(STORAGE_KEY)
  }

  const signTransaction = async (hex: string): Promise<string> => {
    if (!window.xcpwallet) throw new Error('Wallet not available')
    const result = await window.xcpwallet.request({
      method: 'xcp_signTransaction',
      params: [hex],
    })
    const signed = result && typeof result === 'object' && 'hex' in result ? (result as { hex: string }).hex : undefined
    if (!signed) throw new Error('Wallet returned invalid sign response')
    return signed
  }

  const broadcastTransaction = async (hex: string): Promise<string> => {
    if (!window.xcpwallet) throw new Error('Wallet not available')
    const result = await window.xcpwallet.request({
      method: 'xcp_broadcastTransaction',
      params: [hex],
    })
    const txid = result && typeof result === 'object' && 'txid' in result ? (result as { txid: string }).txid : undefined
    if (!txid) throw new Error('Wallet returned invalid broadcast response')
    return txid
  }

  return (
    <WalletContext value={{
      status,
      address,
      connecting,
      connect,
      disconnect,
      signTransaction,
      broadcastTransaction,
    }}>
      {children}
    </WalletContext>
  )
}

export function useWallet() {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet must be used within WalletProvider')
  return ctx
}
