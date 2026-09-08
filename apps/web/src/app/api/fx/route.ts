import { parseFxTable } from '@/lib/display-format'

/** Same ECB reference feed used by Launchpad; market values remain USD internally. */
export async function GET() {
  try {
    const response = await fetch('https://api.frankfurter.dev/v1/latest?base=USD', {
      signal: AbortSignal.timeout(6000), cache: 'no-store',
    })
    const table = response.ok ? parseFxTable(await response.json()) : null
    if (table) return Response.json(table, { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=3600' } })
  } catch { /* No conversion is safer than relabeling USD. */ }
  return Response.json({ error: 'Exchange rates unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
}
