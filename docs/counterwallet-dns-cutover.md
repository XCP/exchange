# api.counterwallet.io Pages and DNS handoff

Last verified: 2026-09-02

Current state: the `counterwallet-api` Pages project is deployed at
`https://counterwallet-api.pages.dev`. Cloudflare has registered
`api.counterwallet.io` and is waiting for its CNAME. The complete CMC,
CoinGecko, DefiLlama, documentation, methodology, status, and OpenAPI surfaces
have been verified through the Pages hostname.

This is the operational handoff for publishing the market-data gateway at
`api.counterwallet.io` while Adam keeps the parent domain on its existing
Namecheap nameservers.

## Decision

Use a Cloudflare Pages project with Pages Functions, not a Workers Custom
Domain. Cloudflare Pages supports a custom subdomain whose authoritative DNS is
hosted elsewhere. The existing gateway retains its private Cloudflare service
binding to `xcpdex-api`.

This approach does not change:

- the `counterwallet.io` apex redirect;
- the domain's authoritative nameservers;
- DNSSEC or its current DS record;
- Google Workspace MX, SPF, DKIM, or DMARC records; or
- any other existing Namecheap host record.

A plain CNAME to a `workers.dev` hostname is not equivalent. Workers Custom
Domains require the hostname's zone to be active in the same Cloudflare
account. Pages is the supported external-DNS path for this subdomain.

## Exchange/Cloudflare operator

1. Run the local checks:

   ```sh
   npm run check --workspace counterwallet-gateway
   ```

2. In the Cloudflare account that owns the `xcpdex-api` Worker, create the Pages
   project `counterwallet-api` if it does not already exist, then deploy:

   ```sh
   npm run deploy:pages --workspace counterwallet-gateway
   ```

3. Confirm the production deployment works at
   `https://counterwallet-api.pages.dev`.
4. In **Workers & Pages → counterwallet-api → Custom domains**, select **Set up
   a domain** and enter `api.counterwallet.io`.
5. Send Adam the required CNAME target: `counterwallet-api.pages.dev`.
   Do this before Adam creates the CNAME; Cloudflare warns that manually creating
   it without first associating the hostname can result in a `522`.
6. After DNS resolves, confirm that Cloudflare has issued a valid certificate and
   run all verification checks below.

If the service binding is configured in the dashboard instead of Wrangler, its
variable name must be `XCPDEX_API`, its service must be `xcpdex-api`, and the
Pages project must be redeployed after adding it.

## Domain owner (Adam)

Wait until the operator has added `api.counterwallet.io` to the Pages project
and has sent the exact Pages target. Then:

1. Open **Namecheap → Domain List → counterwallet.io → Manage → Advanced DNS**.
2. Select **Add New Record**.
3. Create exactly this record:

   | Type | Host | Value | TTL |
   | --- | --- | --- | --- |
   | CNAME | `api` | `counterwallet-api.pages.dev` | Automatic |

4. Remove an existing `api` A, AAAA, CNAME, or URL Redirect record only if it
   conflicts with this new record. Do not modify the apex (`@`), `www`, MX, TXT,
   nameserver, or DNSSEC settings.
5. Send the operator a screenshot of the saved `api` row. Credentials are not
   needed.

Namecheap may display the CNAME target without a trailing dot; that is normal.
Do not enter `https://`, a path, or a Cloudflare IP address in the Value field.

## Copy/paste message to Adam

> Please keep counterwallet.io's nameservers and all current DNS records as they
> are. In Namecheap Advanced DNS, add one CNAME record with Host `api`, Value
> `counterwallet-api.pages.dev`, and TTL Automatic. Cloudflare has already
> associated `api.counterwallet.io` with the Pages project. Please do not use
> `https://` or add a path, and send us a screenshot of the saved row.

## Verification

DNS:

```powershell
Resolve-DnsName api.counterwallet.io -Type CNAME -Server 1.1.1.1
Resolve-DnsName api.counterwallet.io -Type CNAME -Server 8.8.8.8
```

HTTPS and gateway behavior:

```sh
curl -fsS https://api.counterwallet.io/docs
curl -fsS https://api.counterwallet.io/
curl -fsS https://api.counterwallet.io/methodology
curl -fsS https://api.counterwallet.io/status.json
curl -fsS https://api.counterwallet.io/.well-known/counterparty-market-data.json
curl -fsS https://api.counterwallet.io/api/v1/coinmarketcap/summary
curl -fsS https://api.counterwallet.io/api/v1/coingecko/tickers
curl -fsS https://api.counterwallet.io/api/v1/openapi.json
```

Acceptance checks:

- the certificate covers `api.counterwallet.io` and has no browser warning;
- the index, docs, methodology, manifest, and status pages use the
  `api.counterwallet.io` origin;
- JSON routes are unauthenticated and return permissive CORS headers;
- OpenAPI lists `https://api.counterwallet.io/api/v1` as its primary server;
- no Cloudflare challenge, login, cookie requirement, or regional block appears;
- the apex redirect and Google Workspace mail continue unchanged.

If certificate issuance stalls, inspect CAA records before changing anything
else. Do not disable DNSSEC or migrate the zone as a troubleshooting shortcut.

## Rollback

Remove only the `api` CNAME from Namecheap and remove
`api.counterwallet.io` from the Pages project's Custom domains screen. The apex,
mail, nameservers, and DNSSEC are unaffected. The Pages deployment remains
available on its `*.pages.dev` hostname for diagnosis or a later retry.
