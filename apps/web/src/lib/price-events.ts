/**
 * Dated events worth marking on the XCP price chart.
 *
 * Hardcoded on purpose. Two of the three kinds below cannot be derived from
 * Counterparty data at all — an exchange announcement and a Japanese statute
 * leave no on-chain trace — and the chain-derived ones are pinned here rather
 * than fetched so a chart annotation never depends on a live query.
 *
 * Either an entry links to something a reader can check, or it does not. That
 * is the only distinction worth drawing — an earlier version also tagged each
 * date as chain-derived or researched, which sorted them by how WE found them
 * rather than by what a reader can do with them.
 *
 * A deliberate omission: exchange DELISTING dates are the announcement, not the
 * last on-chain movement. Both delistings here were first derived as a "last
 * XCP debit" and both landed weeks late — Poloniex's last debit is 2019-06-25,
 * eight days after its published 17 June withdrawal deadline, and Bittrex's is
 * 2020-04-03, six weeks after its 21 February wallet removal. That is an
 * exchange sweeping its own wallets after the door closed, so the derived date
 * measures cleanup rather than the event. The published date is used instead.
 */

export interface PriceEvent {
  /** YYYY-MM-DD, UTC. */
  day: string
  /** Shortest comprehensible label — this sits in a tooltip, not a paragraph. */
  label: string
  /** How the date was established, for anyone auditing the list. */
  note: string
  /**
   * Where to read more. Only the researched entries have one — a chain-derived
   * date has no article behind it, just the query in `note`, and inventing a
   * link for those would imply an authority that does not exist.
   */
  url?: string
  /**
   * Never merged into a neighbouring dot.
   *
   * Clustering measures horizontal distance only, because that is all it can
   * know before the chart has laid out. An all-time high is the exception
   * worth carving out: it sits at the top of the plot by definition, so it
   * cannot collide with markers sitting on the low part of the line however
   * near in time they are.
   */
  solo?: boolean
}

export const PRICE_EVENTS: PriceEvent[] = [
  {
    day: '2014-01-02',
    label: 'Counterparty launches',
    note: 'First Counterparty block, 278319',
    url: 'https://www.xcp.io/block/278319',
  },
  {
    day: '2014-02-02',
    label: 'XCP burn period ends',
    note: 'Last valid burn, at block 283810',
    url: 'https://www.xcp.io/block/283810',
  },
  {
    day: '2014-09-27',
    label: 'Poloniex lists XCP',
    note: 'First XCP into a known Poloniex address',
    url: 'https://www.xcp.io/address/1Po1oXMCWobE6kxWr8rJEP1SRq71JSD3t4',
  },
  {
    day: '2015-01-31',
    label: 'Bittrex lists XCP',
    note: 'First XCP into the known Bittrex address',
    url: 'https://www.xcp.io/address/1AeqgtHedfA2yVXH6GiKLS2JGkfWfgyTC6',
  },
  {
    day: '2015-03-11',
    label: 'FDCARD issued',
    note: 'Issued at block 347172',
    url: 'https://www.xcp.io/asset/FDCARD',
  },
  {
    day: '2015-07-30',
    label: 'Ethereum mainnet',
    note: 'Frontier release, 30 July 2015',
    url: 'https://ethereum.org/en/history/',
  },
  {
    day: '2016-02-23',
    label: 'Zaif lists XCP',
    note: 'First XCP into a known Zaif address',
    url: 'https://www.xcp.io/address/14rR75DYPaKLSt6UHBakR2h3n8QadTEGxG',
  },
  {
    day: '2016-09-09',
    label: 'RAREPEPE issued',
    note: 'Issued at block 428919, supply 300',
    url: 'https://www.xcp.io/asset/RAREPEPE',
  },
  {
    day: '2017-04-01',
    label: 'Virtual Currency Act (Japan)',
    note: 'Amended Payment Services Act comes into force',
    url: 'https://www.fsa.go.jp/en/news/2017/20170930-1/02.pdf',
  },
  {
    day: '2018-01-04',
    label: 'Counterparty Foundation ends',
    // Six days before XCP's all-time high. The directors voted to dissolve
    // immediately and the project continued as open source with no foundation
    // and no general fund.
    note: 'Directors vote to dissolve the foundation',
    url: 'https://forums.counterparty.io/t/the-state-of-the-counterparty-project/4332',
  },
  {
    day: '2018-01-13',
    label: 'HOMERPEPE sells for $40,000',
    // Sources put the Rare Digital Art Festival in mid-January 2018 without
    // agreeing on the day, and the price is variously reported as a $38.5k
    // winning bid, 350,000 PEPECASH, or ~$40k. The round figure is the one
    // Right Click Save uses. Days do not matter at this zoom; the point is
    // that it lands within a week of XCP's all-time high.
    note: 'Rare Digital Art Festival, New York',
    url: 'https://www.rightclicksave.com/article/rare-digital-art-festival-anniversary-joe-looney',
  },
  {
    day: '2019-05-17',
    label: 'Poloniex delists XCP',
    note: 'Markets disabled; withdrawals until 17 June',
    url: 'https://support.poloniex.com/hc/en-us/articles/360040013653-Delisted-Assets',
  },
  {
    day: '2019-05-31',
    label: 'Bittrex delists XCP',
    note: 'Market removed; wallet removed 21 Feb 2020',
    url: 'https://bittrex.zendesk.com/hc/en-us/articles/360028517951-Pending-Market-Removals-5-31-2019',
  },
  {
    day: '2019-10-23',
    label: 'First dispenser',
    note: 'The first dispenser opened, selling XCP',
    url: 'https://www.xcp.io/tx/4a960783ac0594d25da3d65109e4109e7c3c72b7e7adc0d148f57ebc6909e4aa',
  },
  {
    day: '2020-03-16',
    label: 'Solana mainnet',
    note: 'Mainnet Beta genesis, 16 March 2020',
    url: 'https://solana.com/news/solana-mainnet-beta',
  },
  {
    day: '2020-04-30',
    label: 'Dex-Trade lists XCP',
    note: 'First XCP into a known Dex-Trade address',
    url: 'https://www.xcp.io/address/1LhEGAPUZnfNDbh7oFogdekUyTW8NBfW3g',
  },
  {
    day: '2021-01-31',
    label: 'First Emblem Vault',
    note: 'SMALLWORLD, the first asset vaulted onto Ethereum',
    url: 'https://www.xcp.io/tx/8bb11d077b88b2dffda091794392fda110c4329c6338a9978966a418c2e439d9',
  },
  {
    day: '2021-10-01',
    label: 'RAREPEPE sells for $530,000',
    /*
     * 11 BTC through a DISPENSER, not a wrapped sale on OpenSea. Press
     * coverage at the time reported 111 ETH (~$353k) and ~$500k for
     * Emblem-wrapped cards, and both are smaller than what the chain shows:
     * dispenses of 8-11 BTC ran from 28 August to 12 October 2021, which is
     * also the window in which XCP/BTC rose 421%.
     *
     * Derived from our own dispenses table priced at that day BTC/USD, so it
     * is reproducible rather than cited.
     */
    note: 'Largest RAREPEPE sale on record, 11 BTC via dispenser',
    url: 'https://www.xcp.io/asset/RAREPEPE',
  },  {
    day: '2021-10-26',
    label: 'PEPENOPOULOS sells for $3.65M',
    /*
     * The record, and invisible to our own data: Sotheby's Natively Digital
     * 1.2 settled off-chain, so the dispenses and trades tables cannot see it.
     * Worth stating because a query of our database alone would confidently
     * report the 11 BTC dispense three weeks earlier as the largest sale.
     */
    note: "Sotheby's Natively Digital 1.2",
    url: 'https://forkast.news/sothebys-first-metaverse-auction-nft-record/',
  },
  {
    day: '2023-01-20',
    label: 'Ordinals mainnet',
    note: 'Launched 20 Jan 2023; inscription #0 predates it',
    url: 'https://rodarmor.com/blog/how-ordinals-came-to-be/',
  },
  {
    day: '2023-03-07',
    label: 'First STAMP created',
    note: 'The first Bitcoin Stamp',
    url: 'https://www.xcp.io/tx/17686488353b65b128d19031240478ba50f1387d0ea7e5f188ea7fda78ea06f4',
  },
  {
    day: '2023-03-08',
    label: 'First BRC-20 created',
    // ORDI, by domo. One day after the first Bitcoin Stamp — the two token
    // standards that put arbitrary data on Bitcoin arrived the same week.
    note: 'ORDI, deployed by domo',
    url: 'https://bitcoinmagazine.com/glossary/brc-20',
  },
  {
    day: '2024-10-17',
    label: 'First fairminter',
    note: 'MINTS, the first fairminted asset',
    url: 'https://www.xcp.io/tx/fbe048637dbd9fe7d57787901369cc3982fa442c895d47b0ba900931692cb03e',
  },
  {
    day: '2026-06-08',
    label: 'First pool',
    note: 'First liquidity deposit, BITCORN / XCP',
    url: 'https://www.xcp.io/tx/a5648507864ea0d63272d57235c7419480bf9e07c0f2a612b603950c86251e05',
  },
]
