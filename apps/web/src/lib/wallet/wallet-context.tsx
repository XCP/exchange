'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { detectProvider, XcpWallet, friendlyError } from './sdk'

type XcpWalletStatus = 'not_detected' | 'disconnected' | 'connected'

interface WalletContextValue {
  status: XcpWalletStatus
  address: string | null
  connecting: boolean
  connectError: string | null
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  signMessage: (message: string) => Promise<string>
  signTransaction: (hex: string) => Promise<string>
  signPsbt: (hex: string, signInputs?: Record<string, number[]>, sighashTypes?: number[]) => Promise<string>
  broadcastTransaction: (hex: string) => Promise<string>
}

const WalletContext = createContext<WalletContextValue | null>(null)

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
  const [status, setStatus] = useState<XcpWalletStatus>('not_detected')
  const [address, setAddress] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)
  const connectingRef = useRef(false)
  const disconnectingRef = useRef(false)
  const walletRef = useRef<XcpWallet | null>(null)

  // Detect wallet, subscribe to events, and auto-reconnect
  useEffect(() => {
    let cancelled = false

    const onAccountsChanged = (accounts: string[]) => {
      if (cancelled) return
      if (accounts.length === 0) {
        setAddress((prev) => prev === null ? prev : null)
        setStatus('disconnected')
      } else {
        setAddress((prev) => prev === accounts[0] ? prev : accounts[0])
        setStatus('connected')
        setConnectError(null)
        storageSet(STORAGE_KEY, '1')
      }
    }

    const onDisconnect = () => {
      if (cancelled) return
      setAddress(null)
      setStatus('disconnected')
      storageRemove(STORAGE_KEY)
    }

    detectProvider()
      .then(async (provider) => {
        if (cancelled) return
        const wallet = new XcpWallet(provider)
        walletRef.current = wallet

        wallet.on('accountsChanged', onAccountsChanged)
        wallet.on('disconnect', onDisconnect)

        setStatus('disconnected')

        // Auto-reconnect if previously connected
        if (storageGet(STORAGE_KEY)) {
          try {
            const accounts = await wallet.getAccounts()
            if (cancelled) return
            if (accounts.length > 0) {
              setAddress(accounts[0])
              setStatus('connected')
            }
          } catch (e) {
            console.warn('[wallet] auto-reconnect failed:', e)
          }
        }
      })
      .catch(() => {
        // Wallet not detected — status stays 'not_detected'
      })

    return () => {
      cancelled = true
      walletRef.current?.off('accountsChanged', onAccountsChanged)
      walletRef.current?.off('disconnect', onDisconnect)
    }
  }, [])

  const connect = async () => {
    if (connectingRef.current) return
    const wallet = walletRef.current
    if (!wallet) {
      setConnectError('No XCP wallet extension detected — please install one')
      return
    }
    connectingRef.current = true
    disconnectingRef.current = false
    setConnecting(true)
    setConnectError(null)
    try {
      const accounts = await wallet.connect()
      // Abort if disconnect was called while we were waiting
      if (disconnectingRef.current) return
      if (accounts.length > 0) {
        setAddress(accounts[0])
        setStatus('connected')
        storageSet(STORAGE_KEY, '1')
      }
    } catch (e) {
      setConnectError(friendlyError(e))
    } finally {
      connectingRef.current = false
      setConnecting(false)
    }
  }

  const disconnect = async () => {
    disconnectingRef.current = true
    const wallet = walletRef.current
    if (wallet) {
      try {
        await wallet.disconnect()
      } catch (e) {
        console.warn('[wallet] disconnect failed:', e)
      }
    }
    setAddress(null)
    setStatus('disconnected')
    setConnectError(null)
    storageRemove(STORAGE_KEY)
  }

  const signMessage = (message: string): Promise<string> => {
    if (!walletRef.current) throw new Error('Wallet not available')
    return walletRef.current.signMessage(message)
  }

  const signTransaction = (hex: string): Promise<string> => {
    if (!walletRef.current) throw new Error('Wallet not available')
    return walletRef.current.signTransaction(hex)
  }

  const signPsbt = (
    hex: string,
    signInputs?: Record<string, number[]>,
    sighashTypes?: number[],
  ): Promise<string> => {
    if (!walletRef.current) throw new Error('Wallet not available')
    return walletRef.current.signPsbt(hex, signInputs, sighashTypes)
  }

  const broadcastTransaction = (hex: string): Promise<string> => {
    if (!walletRef.current) throw new Error('Wallet not available')
    return walletRef.current.broadcastTransaction(hex)
  }

  return (
    <WalletContext value={{
      status,
      address,
      connecting,
      connectError,
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
