import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // /swap used to be the atomic-swap surface; it now belongs to the pool+book
  // swap widget, so the old paths move to /atomic permanently. Listing links
  // were shared and indexed, so these have to keep resolving.
  async redirects() {
    return [
      // These two keep working because they are literal paths, matched ahead
      // of the deep-link catch-all below them.
      { source: '/swap/sell', destination: '/atomic/sell', permanent: true },
      { source: '/swap/buy/:id', destination: '/atomic/buy/:id', permanent: true },
      // NOTE: there is deliberately no /swap/:asset -> /atomic/:asset rule.
      // That segment now means "swap this asset", and a redirect would
      // swallow every deep link the form produces. An old atomic listing
      // link like /swap/PEPECASH lands on the swap form for PEPECASH, which
      // is a reasonable destination rather than a 404.
      // Dispensing split into the two sides it always had, each with its own
      // URL so a share carries the side. Buying is the common case.
      // The browse surfaces live under one Explore tab set. Exact paths only
      // — /pool/:lp_asset is a detail page and stays where it is.
      { source: '/trade', destination: '/explore/orders', permanent: true },
      { source: '/dispensers', destination: '/explore/dispensers', permanent: true },
      { source: '/pool', destination: '/explore/pools', permanent: true },
      // There is no separate "create a pool" step: the first deposit into a
      // pair that has none IS the creation, and /liquidity already handles
      // that case. Config redirects run before the filesystem, so this beats
      // the /pool/[lp_asset] forwarder below.
      { source: '/pool/create', destination: '/liquidity/deposit', permanent: true },
      // An LP token is an asset, so its page lives in the asset namespace.
      // Scoped to numeric A-names so /pool/create keeps working — Counterparty
      // requires an LP asset to be a numeric asset, so the pattern is exact.
      { source: '/pool/:lp(A\d+)', destination: '/:lp', permanent: true },
      // Explore is a tab set, not a page. A bare /explore lands on its first
      // tab rather than bouncing out of the section it just asked for.
      { source: '/explore', destination: '/explore/assets', permanent: true },
      // Fairminters was replaced by Launches, which sits at the top level
      // rather than under /explore.
      { source: '/explore/fairminters', destination: '/launches', permanent: true },
      { source: '/explore/launches', destination: '/launches', permanent: true },
      // Nothing is called "dispense" any more: the two sides of it are /buy
      // and /sell, and the inventory is a browse surface. Bare goes to the
      // inventory; naming an asset is an intent to buy from one.
      { source: '/dispense', destination: '/explore/dispensers', permanent: true },
      { source: '/dispense/:asset', destination: '/buy/:asset', permanent: true },
    ]
  },
  turbopack: {
    root: path.resolve(process.cwd(), "../.."),
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.xcp.io' },
    ],
  },
};

export default nextConfig;
