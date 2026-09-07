import { expect, test } from '@playwright/test'

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
