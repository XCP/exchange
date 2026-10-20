# Casa Tookan app

The app manifest is served at `/.well-known/wallet-app.json`. The PNGs under `/wallet-app/` provide its icon, banner and splash. Paths are root-relative so they resolve outside `/.well-known/`.

The manifest makes this site discoverable when a user saves it in Casa Tookan. It does not register the site in a curated directory or enable new signing methods. Bitcoin support is optional because browsing needs no wallet. The splash uses Casa Tookan's automatic readiness timeout.

The connection pilot is opt-in; see the pilot section below.

## Deployment check

- Fetch the manifest without cookies and confirm JSON, HTTP 200 and `Access-Control-Allow-Origin: *`.
- Fetch a missing `/.well-known/` path and a missing `/wallet-app/` image: each must return 404 with CORS, not the homepage.
- Fetch all three images: 1024×1024 opaque icon, 1200×630 banner, 200×200 splash.
- Open the site in the native Casa Tookan browser, save it and reopen its app card. Check the title, artwork and splash dismissal.

Headers are configured in both Next (SSR/404) and Cloudflare Static Assets (public files). Production framing and CSP policies are unchanged; the development iframe bridge is not installed.

Format: https://docs.casatookan.com/apps.html

## Connection pilot

Set `NEXT_PUBLIC_CASATOOKAN_ENABLED=true` **at build time** on a preview build.
The default build keeps the existing wallet choices. The SDK commit is pinned
in `apps/web/package.json` and the lockfile.

The pilot supports mainnet Legacy and Native SegWit accounts, ordinary
SIGHASH_ALL transactions whose inputs all belong to the selected account, and
verified message proofs. Taproot, batches, partial signing, marketplace intents
and commit/reveal are unavailable. The raw compose path falls back to PSBT.

Before turning on production, complete the native signer checks in the SDK's
`docs/casatookan.md`, including a normal DEX compose, rejection, profile change
and reconnect. Unit tests and local previews do not establish native signing
compatibility.
## Browser coverage

`npm run test:e2e --workspace apps/web -- casatookan.spec.ts` exercises the real
header and wallet chooser with an injected test bridge: connect, silent restore,
disconnect, competing wallets, late injection, rejection/retry, unsupported
accounts, profile changes, revocation and mobile layout. It also checks manifest
and 404 CORS responses. These tests do not run Casa Tookan's installed signer.

## Live development signer check — 2026-10-20

XCPDEX's production build was also exercised inside Casa Tookan's web development
app (2.1.0, build `bfbcddd-dirty`) through its official iframe bridge and a
temporary HTTPS preview. Legacy and Native SegWit connection, rejection,
disconnect, reconnect and passive restore were checked against the actual
provider. Separate SDK fixtures verified message and synthetic PSBT signatures
for both address types without broadcasting.

That run found a stale account after permission was revoked while the page was
closed. The pinned SDK clears that cached identity and restores event listeners
after React's development effect restart. The browser suite covers the revoked
grant on reload and explicit reconnect.
The final production build was reopened after revoking its real Casa Tookan
grant: it displayed Connect, with no cached account and no unsolicited prompt.

The temporary bridge is not part of this site's build. Production remains opt-in;
installed iOS/Android signing and a funded DEX compose remain unverified.
