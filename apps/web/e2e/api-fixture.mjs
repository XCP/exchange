import { createServer } from 'node:http'

// All numeric reads in this browser suite are fixtures. No wallet is connected.
createServer((request, response) => {
  const path = new URL(request.url, 'http://127.0.0.1:3115').pathname
  const asset = path.match(/^\/v2\/assets\/([^/]+)$/)?.[1]
  const result = asset
    ? { asset, asset_longname: null, divisible: asset !== 'WHOLE', supply: 100000000, supply_normalized: '1', description: '', locked: false }
    : path.includes('/quote')
      ? { estimated_output: '100', pool_output: '100', book_output: 0, give_remaining: 0, price_impact: 0 }
      : []
  response.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' })
  response.end(JSON.stringify({ result, pools: [], entries: [], trades: [], orders: [], dispensers: [], prices: {}, total: 0 }))
}).listen(3115, '127.0.0.1')
