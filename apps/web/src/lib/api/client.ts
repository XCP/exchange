import { COUNTERPARTY_API_BASE, DEX_API_BASE } from '@/utils/constants'

export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`)
  }
  return res.json()
}

// api.counterparty.io URL builders
export function counterpartyUrl(path: string): string {
  return `${COUNTERPARTY_API_BASE}${path}`
}

// api.xcpdex.com URL builders
export function dexUrl(path: string): string {
  return `${DEX_API_BASE}${path}`
}
