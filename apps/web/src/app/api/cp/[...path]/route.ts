import { COUNTERPARTY_API_BASE } from '@/utils/constants'
import { serializeComposeParams, serializeQuoteQuantity } from '@xcp/wallet-sdk'

/**
 * Counterparty, relayed through our own origin.
 *
 * The browser talks to api.counterparty.io directly for everything the server
 * did not already render, and that is deliberate: it is free and it stays in
 * the browser. It is also a single host that can decide to stop talking to one
 * visitor, and when it does, the whole site goes with it.
 *
 * That host sits behind Google Cloud Armor, whose denials do not carry CORS
 * headers — so the browser refuses to expose them and script sees a bare
 * TypeError with no status at all. The SDK's relayingFetch carries the full
 * diagnosis; this is the other half of it, the host that answers when the node
 * will not.
 *
 * Second, not first: relayingFetch only comes here after a direct read has
 * already failed. Every relayed visitor shares one egress IP upstream, so
 * routing everyone through here by default would turn a per-visitor rate limit
 * into a per-site one.
 */

/** GET only, and only onward to /v2. This forwards to a third party under our
 *  own name; there is no reason it should carry writes, and no reason it
 *  should be able to name a path the site does not already use. */
const ALLOWED_PREFIX = 'v2'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  if (path[0] !== ALLOWED_PREFIX) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  // COUNTERPARTY_API_BASE already ends in /v2 and the caller's path repeats it,
  // so take the base's origin and let the caller's path be the whole path. That
  // keeps this correct if the constant is ever pointed at another node.
  const origin = new URL(COUNTERPARTY_API_BASE).origin
  const query = new URL(request.url).searchParams
  try {
    const composeIndex = path.indexOf('compose')
    if (composeIndex >= 0) {
      if (composeIndex !== path.length - 2) throw new Error('Invalid compose path')
      for (const name of query.keys()) if (query.getAll(name).length !== 1) throw new Error(`Duplicate parameter: ${name}`)
      serializeComposeParams(path[composeIndex + 1], Object.fromEntries(query))
    } else if (path.includes('quote') && path[1] === 'pools') {
      if (query.getAll('quantity').length !== 1) throw new Error('One raw quantity is required')
      serializeQuoteQuantity(query.get('quantity')!)
    }
  } catch (error) {
    return Response.json({ error: 'Invalid transaction parameter', details: error instanceof Error ? error.message : 'Invalid amount' }, { status: 400 })
  }
  const search = query.size ? `?${query.toString()}` : ''
  const target = `${origin}/${path.map(encodeURIComponent).join('/')}${search}`

  let upstream: Response
  try {
    upstream = await fetch(target, {
      // A stalled node must not hold a worker invocation open on behalf of one
      // visitor's retry.
      signal: AbortSignal.timeout(8_000),
      headers: { accept: 'application/json' },
    })
  } catch {
    return Response.json({ error: 'Counterparty unreachable' }, { status: 502 })
  }

  // Pass the body through untouched — quantities in it are 64-bit integers the
  // client parses losslessly, and re-encoding JSON here would round them.
  // Status travels with it, so a 404 stays a 404 rather than becoming an empty
  // success.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
      // These answers are per-address and per-moment; a shared cache holding
      // them would serve one visitor's balance to another.
      'cache-control': upstream.headers.get('cache-control') ?? 'no-store',
    },
  })
}
