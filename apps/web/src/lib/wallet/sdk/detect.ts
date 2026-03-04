import type { XcpProvider } from './types'

/**
 * Async detection that handles the race between script load and extension injection.
 * Resolves with the provider once available, or rejects after timeout.
 *
 * Default timeout is 2000ms to account for cold browser starts and slow devices.
 */
export function detectProvider(timeoutMs = 2000): Promise<XcpProvider> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Not in a browser environment'))
  if (window.xcpwallet) return Promise.resolve(window.xcpwallet)

  return new Promise<XcpProvider>((resolve, reject) => {
    const handler = () => {
      if (window.xcpwallet) {
        cleanup()
        resolve(window.xcpwallet)
      }
    }

    const timer = setTimeout(() => {
      cleanup()
      if (window.xcpwallet) {
        resolve(window.xcpwallet)
      } else {
        reject(new Error('XCP wallet not detected'))
      }
    }, timeoutMs)

    function cleanup() {
      window.removeEventListener('xcp-wallet#initialized', handler)
      clearTimeout(timer)
    }

    window.addEventListener('xcp-wallet#initialized', handler)
  })
}

/** Sync check — returns the provider if already injected, otherwise null. */
export function getProvider(): XcpProvider | null {
  if (typeof window === 'undefined') return null
  return window.xcpwallet ?? null
}
