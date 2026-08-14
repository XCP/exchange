import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Market Data Methodology | XCP DEX',
  description:
    'How XCP DEX calculates prices and volumes: completed Counterparty order-book settlements, AMM pool fills, and protocol-priced dispenser executions.',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-zinc-100">{title}</h2>
      {children}
    </section>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed text-zinc-400">{children}</p>
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-zinc-900 px-1 py-0.5 font-mono text-[13px] text-zinc-300">{children}</code>
}

export default function MethodologyPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-10">
      <header className="space-y-3">
        <h1 className="text-2xl font-bold text-zinc-100">Market Data Methodology</h1>
        <P>
          XCP DEX is the modern trading interface and market-data service for the Counterparty DEX, a
          protocol-native spot venue on Bitcoin. XCP.io provides the underlying explorer and indexing
          infrastructure; both properties are operated by the same team and read the same indexed
          Counterparty and Bitcoin settlement data. This page defines exactly what the numbers at{' '}
          <Code>api.xcpdex.com</Code> mean.
        </P>
      </header>

      <Section title="Venue definition">
        <P>The feed reports completed spot executions from three protocol-native mechanisms:</P>
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-zinc-400">
          <li>
            <span className="text-zinc-200">Order-book settlements</span> — Counterparty order matches that
            reached <Code>completed</Code> status. Order matches involving BTC remain <Code>pending</Code>{' '}
            until the required BTCPay confirms; pending matches are never counted, and a match that expires
            unpaid never enters the feed.
          </li>
          <li>
            <span className="text-zinc-200">AMM pool fills</span> — completed Counterparty pool matches.
          </li>
          <li>
            <span className="text-zinc-200">Dispenser executions</span> — BTC-denominated purchases from
            Counterparty dispensers, on BTC-quoted pairs only. A dispenser is a protocol object escrowing an
            asset and dispensing it at a fixed satoshi rate to whoever pays its address: a genuine,
            executable, on-chain fixed-price offer.
          </li>
        </ol>
        <P>
          PSBT/UTXO swaps are currently excluded. They are a separate settlement mechanism and will only be
          added with their own trade-ID namespace (code 3, already reserved) and a precise execution
          definition. Markets are an explicit allowlist (<Code>/catalog/pairs</Code>), not everything the
          protocol has ever traded; each entry declares which execution sources actually feed it.
        </P>
      </Section>

      <Section title="Dispenser accounting">
        <div className="rounded border border-zinc-800 bg-zinc-900/50 p-4">
          <P>
            <span className="text-zinc-200">
              Dispenser price and quote volume are calculated from the dispenser&apos;s protocol-defined
              satoshi rate and the quantity actually dispensed — protocol-priced notional. The gross Bitcoin
              payment is never treated as market notional
            </span>
            , because one Bitcoin payment can trigger dispensers for several different assets at the same
            address (the protocol stamps the full payment on every resulting dispense record), and because a
            payment can exceed the exact protocol price. Counting gross payments would duplicate and inflate
            quote volume; counting protocol notional cannot.
          </P>
        </div>
        <P>
          Dispenser-backed liquidity contributes asks only (a dispenser is a standing sell offer); order-book
          bids are the only bids. On the order book endpoint, open dispensers with escrow remaining appear as
          ask levels alongside order-book asks.
        </P>
      </Section>

      <Section title="Prices, quantities, and staleness">
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-zinc-400">
          <li>
            Unit prices are arbitrary-precision, non-scientific decimal strings. Sub-satoshi unit prices are
            real on this venue (1 satoshi for 1,000 units = <Code>0.00000000001</Code>), so prices are not
            truncated to eight decimals.
          </li>
          <li>Asset quantities and volumes are fixed 8-decimal strings (Counterparty divisible-asset precision).</li>
          <li>
            <Code>last_price</Code> always comes from a completed settlement. An open bid or ask is never
            promoted into <Code>last_price</Code>. Where a market&apos;s last completed settlement is old, the
            price remains visible and is labeled: <Code>is_stale</Code> is true when no settlement occurred
            within the last 90 days, and <Code>last_trade_timestamp</Code> carries the settlement&apos;s
            Bitcoin block time.
          </li>
          <li>A nonzero execution is never published with a zero price; such rows are dropped and logged.</li>
        </ul>
      </Section>

      <Section title="DefiLlama volume feed">
        <P>
          The DefiLlama endpoint is venue-wide and does not use the fixed CoinGecko/CoinMarketCap
          market allowlist. It includes every non-hidden Counterparty market whose executed quote
          asset is BTC or XCP, so long-tail base assets are included without assigning them
          speculative prices. The endpoint returns native BTC and XCP quote balances; DefiLlama
          applies its historical BTC and XCP prices for each requested period.
        </P>
        <P>
          <Code>/defillama/volume</Code> accepts an exact half-open historical window in Unix seconds:
          <Code>start_timestamp</Code> is inclusive and <Code>end_timestamp</Code> is exclusive. A
          window that the indexer has not completed returns <Code>503</Code> instead of partial data or
          a placeholder zero. Finalized historical responses are cached at the edge and the endpoint
          performs no database writes.
        </P>
      </Section>

      <Section title="The 24-hour window">
        <P>
          All 24-hour figures use a rolling window — request time minus 24 hours through request time — not a
          UTC calendar day. Inclusion is governed by the Bitcoin block time of the confirming block for every
          source (order match completion, pool fill, dispense). When no settlement occurred in the window,
          volumes are <Code>0.00000000</Code> and high/low fall back to <Code>last_price</Code>.
        </P>
      </Section>

      <Section title="Trade identity">
        <P>Every published fill carries a permanent unique integer:</P>
        <pre className="overflow-x-auto rounded border border-zinc-800 bg-zinc-900/50 p-4 font-mono text-[13px] text-zinc-300">
          {`trade_id = source_id × 8 + source_code

0 = order-book settlement
1 = AMM pool fill
2 = dispenser execution
3 = reserved for PSBT/UTXO swaps`}
        </pre>
        <P>
          Fills are only ever appended under protocol-derived unique keys (order-match identity; transaction
          hash plus dispense index), so an ID never changes or repeats. Each fill also carries{' '}
          <Code>source</Code> and <Code>settlement_txid</Code>, so any number in the feed can be verified
          against the Bitcoin blockchain directly.
        </P>
      </Section>

      <Section title="Verification">
        <P>
          A reconciliation gate runs against the live API before any aggregator submission and after any
          accounting change. It requires: CoinMarketCap and CoinGecko responses equal field-for-field; ticker
          bid/ask equal to the order book&apos;s top levels; ticker volumes, high, low, and last price equal
          to the full rolling-24h historical window (paged exhaustively); no duplicate trade IDs; no
          nonpositive prices; sorted books; and stale flags consistent with the 90-day rule.
        </P>
        <P>
          The accounting rules above are additionally locked by regression tests, including a fixture
          reproducing a real observed pathology: one Bitcoin output triggering twenty dispensers, where the
          venue must book twenty protocol-priced notionals rather than twenty copies of the payment.
        </P>
        <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-400">
          <li>
            API reference:{' '}
            <a href="https://api.xcpdex.com/openapi.json" className="text-green-400 hover:text-green-300">
              api.xcpdex.com/openapi.json
            </a>
          </li>
          <li>
            Market catalog:{' '}
            <a href="https://api.xcpdex.com/catalog/pairs" className="text-green-400 hover:text-green-300">
              api.xcpdex.com/catalog/pairs
            </a>
          </li>
          <li>
            Status: <Link href="/status" className="text-green-400 hover:text-green-300">xcpdex.com/status</Link>
          </li>
          <li>
            Contact: <Code>dan@droplister.com</Code>
          </li>
        </ul>
      </Section>
    </div>
  )
}
