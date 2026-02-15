import { XCP_API_BASE, COUNTERPARTY_API_BASE } from '@/utils/constants'

export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`)
  }
  return res.json()
}

// app.xcp.io URL builders
export function xcpUrl(path: string): string {
  return `${XCP_API_BASE}${path}`
}

// api.counterparty.info URL builders
export function counterpartyUrl(path: string): string {
  return `${COUNTERPARTY_API_BASE}${path}`
}
