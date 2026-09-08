import { expect, test } from '@playwright/test'

test('display settings persist independently while actual amount drafts stay canonical', async ({ page, browser }) => {
  await page.route('**/api/fx', route => route.fulfill({ json: { base: 'USD', date: new Date().toISOString().slice(0, 10), rates: { EUR: 0.9, JPY: 150 } } }))
  await page.goto('/settings')
  await page.getByLabel('Number format', { exact: true }).selectOption('fr-FR')
  await page.getByLabel('Fiat display currency', { exact: true }).selectOption('EUR')
  await expect(page.getByRole('status')).toContainText('Fiat values are shown in EUR')
  await page.getByLabel('Number format', { exact: true }).selectOption('ja-JP')
  await expect(page.getByLabel('Fiat display currency', { exact: true })).toHaveValue('EUR')
  await page.getByLabel('Fiat display currency', { exact: true }).selectOption('USD')
  await page.getByLabel('Number format', { exact: true }).selectOption('fr-FR')
  await page.goto('/limit/ASSET?price=1&side=sell')
  const amount = page.getByRole('textbox', { name: 'Amount', exact: true })
  await amount.pressSequentially('0,5')
  await expect(amount).toHaveValue('0,5')
  await expect(amount).toHaveAttribute('aria-invalid', 'true')
  await amount.fill('100000000.00000001')
  await expect(amount).toHaveValue('100000000.00000001')
  await expect(amount).toHaveAttribute('aria-invalid', 'false')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('link', { name: 'Display settings', exact: true })).toBeInViewport()
  await page.getByRole('link', { name: 'Display settings', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Display settings' })).toBeVisible()
  await page.screenshot({ path: 'test-results/display-settings-mobile.png', fullPage: true })
  // A different browser language with the saved preferences still uses explicit USD/fr-FR.
  const alternate = await browser.newContext({ locale: 'ja-JP', storageState: await page.context().storageState() })
  try {
    const other = await alternate.newPage()
    await other.goto('http://127.0.0.1:3114/settings')
    await expect(other.getByLabel('Number format', { exact: true })).toHaveValue('fr-FR')
    await expect(other.getByLabel('Fiat display currency', { exact: true })).toHaveValue('USD')
    await expect(other.getByText('Interface language: English')).toBeVisible()
  } finally { await alternate.close() }
})

test('legacy atomic routes show retirement without a trading form', async ({ page }) => {
  for (const path of ['/atomic', '/atomic/sell?asset=WHOLE', '/atomic/buy/old-listing']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: 'Atomic trading has been retired' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open Marketplace' })).toHaveAttribute('href', 'https://digirare.com/')
    await expect(page.getByRole('textbox', { name: 'Amount', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /confirm purchase|create listing/i })).toHaveCount(0)
  }
})

for (const locale of ['en-US', 'de-DE', 'fr-FR', 'es-VE', 'ja-JP', 'zh-CN']) {
  test.describe(locale, () => {
    test.use({ locale })
    test('actual amount inputs retain invalid sequential drafts across browser locales', async ({ page, context }) => {
      await page.goto('/limit/ASSET?price=1&side=sell')
      const amount = page.getByRole('textbox', { name: 'Amount', exact: true })
      await expect(amount).toBeVisible()
      for (const draft of ['-5', '1e5', '0,5', '1.2.3', '0.000000001']) {
        await amount.fill('')
        await amount.pressSequentially(draft)
        await expect(amount).toHaveValue(draft)
        await expect(amount).toHaveAttribute('aria-invalid', 'true')
      }
      await context.grantPermissions(['clipboard-read', 'clipboard-write'])
      await amount.fill('')
      await page.evaluate(() => navigator.clipboard.writeText('1\n234'))
      await amount.press('Control+V')
      // Native single-line display omits a newline, but the retained draft is invalid.
      await expect(amount).toHaveAttribute('aria-invalid', 'true')
      await amount.fill('')
      await amount.pressSequentially('0.00000001')
      await expect(amount).toHaveValue('0.00000001')
      await expect(amount).toHaveAttribute('aria-invalid', 'false')
      await amount.fill('100000000.00000001')
      await expect(amount).toHaveValue('100000000.00000001')
      await expect(amount).toHaveAttribute('aria-invalid', 'false')

      await page.goto('/limit/WHOLE?price=1&side=sell')
      await amount.fill('100')
      await expect(amount).toHaveAttribute('aria-invalid', 'false')
      await amount.fill('0.5')
      await expect(amount).toHaveValue('0.5')
      await expect(amount).toHaveAttribute('aria-invalid', 'true')
    })
  })
}
