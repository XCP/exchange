import { expect, test, type Page } from '@playwright/test'
const accounts = [
  { address: 'bc1qvux25709r4uw6rzc8wyl7wwecjdhrx085hm5ty', publicKey: '0256b328b30c8bf5839e24058747879408bdb36241dc9c2e7c619faa12b2920967' },
  { address: 'bc1qpmflkvrhqxn288kc43rl3c8urpvdrxjst0darl', publicKey: '03f76a39d05686e34a4420897e359371836145dd3973e3982568b60f8433adde6e' },
]
const taproot = 'bc1pfqarxerx6v0zh6zcj2f3a3np8jselxn8vgefdx95c0n328qpzg4ssw6kv5'
const short = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`

type BridgeState = {
  reject: boolean
  granted: boolean
  index: number
  requests: number
  unsupported: boolean
  switchProfile: () => void
  revoke: () => void
  inject: () => void
}
type TestWindow = typeof window & { casaTest: BridgeState }

async function bridge(page: Page, options: { delay?: boolean; competing?: boolean; marker?: boolean } = {}) {
  await page.addInitScript(({ accounts, taproot, options }) => {
    const listeners = new Map<string, Set<(...args: unknown[]) => void>>()
    const state = {
      reject: false,
      granted: sessionStorage.getItem('casa-grant') === 'yes',
      index: 0,
      requests: 0,
      unsupported: false,
      switchProfile() {
        state.index = 1
        for (const listener of listeners.get('accountsChanged') ?? []) listener([accounts[1].address])
      },
      revoke() {
        state.granted = false
        sessionStorage.removeItem('casa-grant')
        for (const listener of listeners.get('accountsChanged') ?? []) listener([])
      },
      inject() {
        Object.assign(window, {
          ...(options.marker === false ? {} : { casaTookan: { isCasaTookan: true } }),
          unisat: {
            requestAccounts: async () => {
              state.requests++
              if (state.reject) throw { code: 4001, message: 'User rejected connection' }
              state.granted = true
              sessionStorage.setItem('casa-grant', 'yes')
              return [state.unsupported ? taproot : accounts[state.index].address]
            },
            getAccounts: async () => state.granted ? [state.unsupported ? taproot : accounts[state.index].address] : [],
            getPublicKey: async () => accounts[state.index].publicKey,
            getNetwork: async () => 'livenet',
            signMessage: async () => { throw new Error('Unexpected signing in connection test') },
            signPsbt: async () => { throw new Error('Unexpected signing in connection test') },
            on: (event: string, listener: (...args: unknown[]) => void) => {
              if (!listeners.has(event)) listeners.set(event, new Set())
              listeners.get(event)!.add(listener)
            },
            removeListener: (event: string, listener: (...args: unknown[]) => void) => listeners.get(event)?.delete(listener),
          },
        })
      },
    }
    Object.assign(window, { casaTest: state })
    if (!options.delay) state.inject()
    if (options.competing) Object.assign(window, {
      HorizonWalletProvider: { request: async () => { throw new Error('Wrong wallet selected') } },
    })
  }, { accounts, taproot, options })
  for (const host of ['api.xcp.io', 'api.xcp.fun', 'mempool.space']) {
    await page.route(`https://${host}/**`, route => route.fulfill({ json: { result: [], fastestFee: 1, halfHourFee: 1, hourFee: 1 } }))
  }
}

const connect = (page: Page) => page.getByRole('banner').getByRole('button', { name: 'Connect', exact: true })
const accountButton = (page: Page, index = 0) => page.getByRole('banner').getByRole('button', { name: short(accounts[index].address) })
const connectionError = (page: Page) => page.getByRole('banner').getByRole('alert')

test('Connect uses Casa Tookan, restores without prompting and disconnects', async ({ page }) => {
  await bridge(page)
  await page.goto('/settings')
  await connect(page).click()
  await expect(accountButton(page)).toBeVisible()
  expect(await page.evaluate(() => (window as TestWindow).casaTest.requests)).toBe(1)
  await accountButton(page).click()
  await expect(page.getByText('via Casa Tookan', { exact: true })).toBeVisible()
  await page.reload()
  await expect(accountButton(page)).toBeVisible()
  expect(await page.evaluate(() => (window as TestWindow).casaTest.requests)).toBe(0)
  await accountButton(page).click()
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click()
  await expect(connect(page)).toBeVisible()
  await page.reload()
  await expect(connect(page)).toBeVisible()
  await connect(page).click()
  await expect(accountButton(page)).toBeVisible()
})

test('the chooser connects the selected wallet when another provider is present', async ({ page }) => {
  await bridge(page, { competing: true })
  await page.goto('/settings')
  await connect(page).click()
  await expect(page.getByRole('heading', { name: 'Choose a Wallet' })).toBeVisible()
  await page.getByRole('listitem').filter({ hasText: 'Casa Tookan' }).getByRole('button', { name: 'Connect' }).click()
  await expect(accountButton(page)).toBeVisible()
})

test('late injection is discovered without refreshing the page', async ({ page }) => {
  await bridge(page, { delay: true })
  await page.goto('/settings')
  await expect(connect(page)).toBeVisible()
  await page.evaluate(() => (window as TestWindow).casaTest.inject())
  await connect(page).click()
  await expect(accountButton(page)).toBeVisible()
})

test('a standalone Unisat provider is not offered as Casa Tookan', async ({ page }) => {
  await bridge(page, { marker: false })
  await page.goto('/settings')
  await connect(page).click()
  await expect(page.getByRole('heading', { name: 'Wallet Required' })).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: 'Casa Tookan' }).getByRole('button', { name: 'Connect' })).toHaveCount(0)
  expect(await page.evaluate(() => (window as TestWindow).casaTest.requests)).toBe(0)
})

test('rejected and unsupported connections show an error and allow retry', async ({ page }, testInfo) => {
  await bridge(page)
  await page.goto('/settings')
  await page.evaluate(() => { (window as TestWindow).casaTest.reject = true })
  await connect(page).click()
  await expect(connectionError(page)).toBeVisible()
  await expect(connect(page)).toBeEnabled()
  await page.evaluate(() => {
    (window as TestWindow).casaTest.reject = false
    ;(window as TestWindow).casaTest.unsupported = true
  })
  await connect(page).click()
  await expect(connectionError(page)).toContainText('Legacy or Native SegWit')
  await page.screenshot({ path: testInfo.outputPath('unsupported-account.png') })
  await page.evaluate(() => { (window as TestWindow).casaTest.unsupported = false })
  await connect(page).click()
  await expect(accountButton(page)).toBeVisible()
  await expect(connectionError(page)).toHaveCount(0)
})

test('profile changes and permission revocation update the visible account', async ({ page }) => {
  await bridge(page)
  await page.goto('/settings')
  await connect(page).click()
  await expect(accountButton(page)).toBeVisible()
  await page.evaluate(() => (window as TestWindow).casaTest.switchProfile())
  await expect(accountButton(page, 1)).toBeVisible()
  await expect(accountButton(page, 0)).toHaveCount(0)
  await page.evaluate(() => (window as TestWindow).casaTest.revoke())
  await expect(connect(page)).toBeVisible()
})

test('the Connect flow works at a narrow mobile viewport', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await bridge(page, { competing: true })
  await page.goto('/settings')
  await expect(connect(page)).toBeInViewport()
  await connect(page).click()
  const choose = page.getByRole('listitem').filter({ hasText: 'Casa Tookan' }).getByRole('button', { name: 'Connect' })
  await expect(choose).toBeInViewport()
  await choose.click()
  await expect(accountButton(page)).toBeInViewport()
  await accountButton(page).click()
  await expect(page.getByRole('button', { name: 'Disconnect' })).toBeInViewport()
  await page.screenshot({ path: testInfo.outputPath('connected-mobile.png') })
})

test('the app manifest and missing public resources have CORS headers', async ({ request }) => {
  const response = await request.get('/.well-known/wallet-app.json')
  expect(response.status()).toBe(200)
  expect(response.headers()['access-control-allow-origin']).toBe('*')
  expect(response.headers()['content-type']).toContain('application/json')
  expect((await response.json()).wallet.version).toBe('1')
  for (const path of ['/.well-known/missing.json', '/wallet-app/missing.png']) {
    const missing = await request.get(path)
    expect(missing.status()).toBe(404)
    expect(missing.headers()['access-control-allow-origin']).toBe('*')
  }
})
