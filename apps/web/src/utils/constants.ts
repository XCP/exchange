export const COUNTERPARTY_API_BASE = process.env.NEXT_PUBLIC_COUNTERPARTY_API_BASE ?? 'https://api.counterparty.io:4000/v2'
export const DEX_API_BASE = process.env.NEXT_PUBLIC_DEX_API_BASE ?? 'https://api.xcpdex.com'
export const XCP_IMG_BASE = process.env.NEXT_PUBLIC_XCP_IMG_BASE ?? 'https://app.xcp.io/img'

export const QUOTE_ASSETS: string[] = [
  'BTC', 'XCP', 'XBTC', 'FLDC', 'SJCX', 'BITCRYSTALS', 'LTBCOIN', 'SCOTCOIN',
  'PEPECASH', 'BITCORN', 'CORNFUTURES', 'NEWBITCORN', 'DATABITS', 'MAFIACASH',
  'PENISIUM', 'RUSTBITS', 'WILLCOIN', 'XFCCOIN', 'SOVEREIGNC', 'OLINCOIN',
  'BITROCK', 'DANKMEMECASH', 'COMMONFROG.PURCHASE', 'PEPSTEIN.HUSHMONEY',
  'SCUDOCOIN', 'GREEEEEECOIN', 'MOULACOIN', 'LICKOIN', 'IAMCOIN', 'NEOCASH',
  'RELICASH', 'SHADILAYCASH', 'BLUEBEARCASH', 'FAKEAPECASH', 'DANKROSECASH',
  'DESANTISCASH', 'DOLLARCASH', 'BOBOCASH', 'SHARPS', 'CRONOS', 'BOBOXX', 'SWARM',
  'DABC', 'KEKO', 'NVST', 'POWC', 'NOJAK', 'NOMNI', 'BASSMINT', 'RAIZER.BTC',
  'RAIZER', 'FUUUUUH.BTC', 'FUUUUUH', 'WOOOOK', 'VACUS', 'MUUI', 'FUTURECREDIT',
]

export const QUOTE_KEYWORDS: string[] = ['CASH', 'COIN', 'MONEY', 'BTC']

export const BURN_ADDRESSES: string[] = [
  '1CounterpartyXXXXXXXXXXXXXXXUWLpVr',
  '1BitcoinEaterAddressDontSendf59kuE',
]

export const EXCHANGE_ADDRESSES: Record<string, string> = {
  '1XCPdWb6kk7PGfvbdRbRuNh51aPc4vqC7': 'Poloniex',
  '1AeqgtHedfA2yVXH6GiKLS2JGkfWfgyTC6': 'Bittrex',
  '19fNvdGbD3dP5zqAsQhDqGyENnR5bHvZB1': 'Dex-Trade',
  '1F2zjMv6dTwTW4r9fJ7zTonXp7Tfk23su3': 'Zaif',
  '1ML2b9tY5V8S9qQw6jNUs5uxkm6nKayk6x': 'Zaif',
}

export const DEFAULT_MARKET = 'XCP'

export const COMPOSE_STATUS_LABELS: Record<string, string> = {
  composing: 'Composing transaction...',
  signing: 'Waiting for signature...',
  broadcasting: 'Broadcasting...',
}
