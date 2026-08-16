import { NextResponse } from 'next/server'

/**
 * Website and social links declared in an asset's enhanced-info JSON.
 *
 * Counterparty assets often set their on-chain description to a URL pointing
 * at a JSON document — the de-facto "enhanced asset info" convention. It
 * carries the things the chain has no field for: a homepage, an X account, a
 * Telegram.
 *
 * This runs on the server rather than in the browser because it has to. Most
 * of these documents are on hosts that predate anyone caring about CORS:
 * rarepepedirectory.com serves PEPECASH's JSON with no
 * `Access-Control-Allow-Origin` at all, so a `fetch` from the page is blocked
 * before it starts. Only newer hosts like xcp.fun send `*`.
 *
 * SSRF is the obvious hazard in "fetch a URL for me", so this is not that:
 *
 *  - The caller names an ASSET, never a URL. The URL comes from the chain.
 *  - http/https only, and the host is checked against private, loopback,
 *    link-local and cloud-metadata ranges before the request is made.
 *  - The body is capped, the request is timed out, and the response is a
 *    fixed shape of extracted fields — the fetched document itself never
 *    reaches the client, so this cannot be used to read anything back.
 */

/** Enough for any of these documents; well short of a memory problem. */
const MAX_BYTES = 64 * 1024
const TIMEOUT_MS = 5000

const COUNTERPARTY_API_BASE =
  process.env.NEXT_PUBLIC_COUNTERPARTY_API_BASE ?? 'https://api.counterparty.io:4000/v2'

/**
 * Hosts a public fetcher must never reach. Covers loopback, RFC1918, CGNAT,
 * link-local (which is where the cloud metadata endpoints live), and the
 * IPv6 equivalents.
 */
const BLOCKED_HOST = /^(localhost|.*\.local|.*\.internal)$/i
const BLOCKED_IPV4 =
  /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/
const BLOCKED_IPV6 = /^(::1?$|::ffff:|f[cd]|fe80:)/i

function isPubliclyRoutable(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '')
  if (!h || BLOCKED_HOST.test(h)) return false
  if (BLOCKED_IPV4.test(h)) return false
  if (h.includes(':') && BLOCKED_IPV6.test(h)) return false
  return true
}

/** The known social kinds, so an unexpected `type` cannot invent a label. */
const SOCIAL_KINDS = ['twitter', 'x', 'telegram', 'discord', 'github', 'instagram', 'youtube', 'facebook', 'reddit', 'medium'] as const
type SocialKind = (typeof SOCIAL_KINDS)[number]

export interface AssetLinks {
  website: string | null
  socials: { kind: SocialKind; url: string }[]
}

/** Only absolute http(s), and only to somewhere a browser should go. */
function safeUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const u = new URL(value.trim())
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    if (!isPubliclyRoutable(u.hostname)) return null
    return u.toString()
  } catch {
    return null
  }
}

/** Map a host to the social it is, so a mislabelled `type` cannot mislead. */
function kindFromUrl(url: string): SocialKind | null {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
  if (host === 'x.com' || host === 'twitter.com') return 'x'
  if (host === 't.me' || host === 'telegram.me' || host === 'telegram.org') return 'telegram'
  if (host.endsWith('discord.gg') || host.endsWith('discord.com')) return 'discord'
  if (host === 'github.com') return 'github'
  if (host === 'instagram.com') return 'instagram'
  if (host === 'youtube.com' || host === 'youtu.be') return 'youtube'
  if (host === 'facebook.com') return 'facebook'
  if (host === 'reddit.com') return 'reddit'
  if (host === 'medium.com') return 'medium'
  return null
}

/**
 * The convention is loose in the wild, so read every shape seen in practice:
 * `social: [{type, data}]` (xcp.fun), `social: {twitter: url}`, and bare
 * top-level `twitter`/`x`/`telegram` keys.
 */
function extractSocials(doc: Record<string, unknown>): { kind: SocialKind; url: string }[] {
  const found = new Map<SocialKind, string>()

  const add = (value: unknown) => {
    const url = safeUrl(value)
    if (!url) return
    // Classified by HOST, not by the document's own label: these files are
    // hand-written and a `type: "twitter"` pointing at Telegram is exactly
    // the kind of thing they contain.
    const kind = kindFromUrl(url)
    if (kind && !found.has(kind)) found.set(kind, url)
  }

  const social = doc.social ?? doc.socials
  if (Array.isArray(social)) {
    for (const entry of social) {
      if (entry && typeof entry === 'object') add((entry as Record<string, unknown>).data ?? (entry as Record<string, unknown>).url)
      else add(entry)
    }
  } else if (social && typeof social === 'object') {
    for (const v of Object.values(social as Record<string, unknown>)) add(v)
  }
  for (const key of SOCIAL_KINDS) add(doc[key])

  return [...found].map(([kind, url]) => ({ kind, url }))
}

const EMPTY: AssetLinks = { website: null, socials: [] }

/** Nothing to show is a normal outcome here, and cached like any other. */
function respond(links: AssetLinks) {
  return NextResponse.json(links, {
    headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
  })
}

export async function GET(request: Request) {
  const asset = new URL(request.url).searchParams.get('asset')?.trim().toUpperCase()
  if (!asset || !/^[A-Z0-9.]{1,64}$/.test(asset)) return respond(EMPTY)

  try {
    // The description comes from the chain. This is what keeps the fetch
    // below from being an open proxy.
    const metaRes = await fetch(`${COUNTERPARTY_API_BASE}/assets/${asset}?verbose=true`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!metaRes.ok) return respond(EMPTY)
    const description: unknown = (await metaRes.json())?.result?.description
    if (typeof description !== 'string') return respond(EMPTY)

    // Some descriptions prefix the URL with @ or * to flag it as a pointer.
    const url = safeUrl(description.trim().replace(/^[@*]/, ''))
    if (!url) return respond(EMPTY)

    const res = await fetch(url, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: 'application/json' },
      redirect: 'follow',
    })
    if (!res.ok) return respond(EMPTY)

    // Length is a hint, not a promise, so the text is truncated regardless.
    const body = (await res.text()).slice(0, MAX_BYTES)
    let doc: unknown
    try {
      doc = JSON.parse(body)
    } catch {
      // Several of these hosts answer 200 with an HTML "not found" page.
      return respond(EMPTY)
    }
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return respond(EMPTY)

    const record = doc as Record<string, unknown>
    return respond({
      website: safeUrl(record.website ?? record.url ?? record.homepage),
      socials: extractSocials(record),
    })
  } catch {
    return respond(EMPTY)
  }
}
