import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { build } from 'esbuild'

process.env.NODE_ENV = 'production'
const { default: React } = await import('react')
const { renderToReadableStream } = await import('next/dist/compiled/react-server-dom-webpack/server.node.js')

// Exercise the actual page and metadata functions inside Next's React Flight
// renderer. Calling cache() outside an RSC render would not test its lifetime.
// Only the Cloudflare context and final client views are replaced; the server
// transport, response parsing, route selection and metadata builder are real.
const web = fileURLToPath(new URL('..', import.meta.url))
const output = path.join(web, '.test-dist/render-reads.cjs')
const expectedReads = Number(process.argv.find((arg) => arg.startsWith('--expected-pool-reads='))?.split('=')[1] ?? 1)
const baselineRef = process.argv.find((arg) => arg.startsWith('--baseline-ref='))?.slice('--baseline-ref='.length)
await mkdir(path.dirname(output), { recursive: true })
await build({
  entryPoints: [path.join(web, 'src/app/[asset]/page.tsx')],
  outfile: output,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  external: ['react', 'react/jsx-runtime'],
  tsconfig: path.join(web, 'tsconfig.json'),
  plugins: [{
    name: 'render-boundaries',
    setup(builder) {
      if (baselineRef) builder.onLoad({ filter: /[\\/]app[\\/]\[asset\][\\/]page\.tsx$/ }, ({ path: filename }) => ({
        contents: execFileSync('git', ['show', `${baselineRef}:apps/web/src/app/[asset]/page.tsx`], { cwd: web, encoding: 'utf8' }),
        loader: 'tsx', resolveDir: path.dirname(filename),
      }))
      builder.onResolve({ filter: /^(server-only|@opennextjs\/cloudflare|next\/navigation)$/ }, ({ path: name }) => ({ path: name, namespace: 'fixture' }))
      builder.onResolve({ filter: /^(\.\/page\.client|@\/components\/pool\/pool-detail)$/ }, ({ path: name }) => ({ path: name, namespace: 'fixture' }))
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path: name }) => {
        if (name === 'server-only') return { contents: '', loader: 'js' }
        if (name === '@opennextjs/cloudflare') return { contents: 'export const getCloudflareContext = async () => globalThis.__renderReadFixture.context;', loader: 'js' }
        if (name === 'next/navigation') return { contents: 'export function notFound() { throw new Error("NEXT_HTTP_ERROR_FALLBACK;404"); }', loader: 'js' }
        const kind = name.includes('pool-detail') ? 'pool' : 'asset'
        return { contents: `import React from 'react'; export default function View() { return React.createElement('main', {'data-view': '${kind}'}); }`, loader: 'js' }
      })
    },
  }],
})
const require = createRequire(import.meta.url)
const { default: Page, generateMetadata } = require(output)
const originalFetch = globalThis.fetch
let fixture
globalThis.fetch = async () => Response.json({ result: { asset: 'PEPE', supply_normalized: '100', locked: true } })

function setup(mode = 'pool', reserve = 10) {
  fixture = { calls: [], cancelled: 0, mode, reserve }
  const current = fixture
  globalThis.__renderReadFixture = {
    context: {
      cf: {},
      env: {
        DEX_API: {
          async fetch(request) {
            const url = new URL(request.url)
            current.calls.push(url.pathname)
            if (!url.pathname.startsWith('/pools/')) return Response.json({})
            if (current.mode === 'throw') throw new Error('upstream unavailable')
            if (current.mode === 'malformed') return new Response('not json')
            if (current.mode === 'missing') return new Response(new ReadableStream({ cancel() { current.cancelled++ } }), { status: 404 })
            return Response.json({ pool: { lp_asset: 'PEPE', pair: 'PEPE_XCP', asset_a: 'PEPE', asset_b: 'XCP', reserve_a: current.reserve, reserve_b: 5, match_count: 2 } })
          },
        },
      },
    },
  }
  return current
}

async function render(asset = 'PEPE') {
  const params = Promise.resolve({ asset })
  async function Metadata() {
    const metadata = await generateMetadata({ params })
    return React.createElement('meta', { name: 'description', content: metadata.description })
  }
  const errors = []
  const stream = renderToReadableStream(React.createElement(React.Fragment, null,
    React.createElement(Metadata), React.createElement(Page, { params })), {}, {
    onError(error) { errors.push(error) },
  })
  const flight = await new Response(stream).text()
  assert.deepEqual(errors, [], 'real server route render must succeed')
  return flight
}

function poolReads(current) {
  return current.calls.filter((pathname) => pathname.startsWith('/pools/')).length
}

try {
  await test('metadata and page share one parsed service-binding pool response', async () => {
    const current = setup()
    const flight = await render()
    assert.equal(poolReads(current), expectedReads)
    assert.match(flight, /data-view.*pool/)
    assert.match(flight, /10 PEPE/)
  })
  await test('a subsequent RSC request sees changed reserves', async () => {
    const first = setup('pool', 11)
    assert.match(await render(), /11 PEPE/)
    assert.equal(poolReads(first), expectedReads)
    const second = setup('pool', 29)
    const flight = await render()
    assert.match(flight, /29 PEPE/)
    assert.doesNotMatch(flight, /11 PEPE/)
    assert.equal(poolReads(second), expectedReads)
  })
  for (const mode of ['missing', 'throw', 'malformed']) {
    await test(`${mode} pool lookup keeps generic asset fallback and retries next request`, async () => {
      const failed = setup(mode)
      assert.match(await render(), /data-view.*asset/)
      assert.equal(poolReads(failed), expectedReads)
      if (mode === 'missing') assert.equal(failed.cancelled, expectedReads, 'unused bodies are released')
      const recovered = setup('pool', 43)
      assert.match(await render(), /43 PEPE/)
      assert.equal(poolReads(recovered), expectedReads)
    })
  }
  console.log(JSON.stringify({ expectedPoolReadsPerRender: expectedReads, subsequentRequestFresh: true, nullAndFailureRecovery: true }))
} finally {
  globalThis.fetch = originalFetch
  delete globalThis.__renderReadFixture
}
