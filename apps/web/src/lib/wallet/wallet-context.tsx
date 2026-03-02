'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

type WalletStatus = 'not_detected' | 'disconnected' | 'connected'

interface WalletContextValue {
  status: WalletStatus
  address: string | null
  connecting: boolean
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  signMessage: (message: string) => Promise<string>
  signTransaction: (hex: string) => Promise<string>
  signPsbt: (hex: string, signInputs?: Record<string, number[]>, sighashTypes?: number[]) => Promise<string>
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
              // Wallet may be locked — keep storage key so user can reconnect
              setAddress(null)
              setStatus('disconnected')
            }
          })
          .catch(() => {
            // Transient error — keep storage key for retry on next load
            setAddress(null)
            setStatus('disconnected')
          })
      }
    }

    if (window.xcpwallet) {
      onDetected()
    } else {
      // Listen for extension injection — no timeout so late injection is caught
      const handler = () => onDetected()
      window.addEventListener('xcp-wallet#initialized', handler)
      return () => {
        window.removeEventListener('xcp-wallet#initialized', handler)
      }
    }
  }, [])

  // Listen for account changes / disconnects
  useEffect(() => {
    if (!window.xcpwallet) return

    const onAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        // Fired on lock OR disconnect — don't clear storage key here
        // (the disconnect event handler below clears it for real disconnects)
        setAddress(null)
        setStatus('disconnected')
      } else {
        setAddress(accounts[0])
        setStatus('connected')
        storageSet(STORAGE_KEY, '1')
      }
    }

    const onDisconnect = () => {
      // Explicit disconnect from extension — clear storage key
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

  const signMessage = async (message: string): Promise<string> => {
    if (!window.xcpwallet) throw new Error('Wallet not available')
    const result = await window.xcpwallet.request({
      method: 'xcp_signMessage',
      params: [message],
    })
    const signature = result && typeof result === 'object' && 'signature' in result
      ? (result as { signature: string }).signature
      : typeof result === 'string' ? result : undefined
    if (!signature) throw new Error('Wallet returned invalid sign message response')
    return signature
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

  const signPsbt = async (psbtHex: string, signInputs?: Record<string, number[]>, sighashTypes?: number[]): Promise<string> => {
    if (!window.xcpwallet) throw new Error('Wallet not available')
    const params: { hex: string; signInputs?: Record<string, number[]>; sighashTypes?: number[] } = { hex: psbtHex }
    if (signInputs) params.signInputs = signInputs
    if (sighashTypes) params.sighashTypes = sighashTypes
    const result = await window.xcpwallet.request({
      method: 'xcp_signPsbt',
      params: [params],
    })
    const signed = result && typeof result === 'object' && 'hex' in result ? (result as { hex: string }).hex : undefined
    if (!signed) throw new Error('Wallet returned invalid PSBT response')
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
      signMessage,
      signTransaction,
      signPsbt,
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
