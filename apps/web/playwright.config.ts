import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  workers: 2,
  use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:3114', trace: 'retain-on-failure' },
  webServer: [
    { command: 'node e2e/api-fixture.mjs', url: 'http://127.0.0.1:3115', timeout: 30_000 },
    {
      command: 'npm run dev -- --hostname 127.0.0.1 --port 3114',
      url: 'http://127.0.0.1:3114/limit', timeout: 120_000,
      env: { NEXT_PUBLIC_COUNTERPARTY_API_BASE: 'http://127.0.0.1:3115/v2', NEXT_PUBLIC_DEX_API_BASE: 'http://127.0.0.1:3115/dex' },
    },
  ],
})
