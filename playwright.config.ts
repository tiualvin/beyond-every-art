import { defineConfig, devices } from '@playwright/test'

const localOrigin = 'http://127.0.0.1:3000'
const baseURL = process.env.PLAYWRIGHT_BASE_URL || localOrigin
const startsLocalServer = !process.env.PLAYWRIGHT_BASE_URL
const serverCommand = process.env.CI
  ? 'pnpm start --hostname 127.0.0.1 --port 3000'
  : 'pnpm exec next dev --hostname 127.0.0.1 --port 3000'

export default defineConfig({
  testDir: './e2e',
  outputDir: 'test-results',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [
        ['github'],
        ['html', { open: 'never', outputFolder: 'playwright-report' }],
      ]
    : [
        ['list'],
        ['html', { open: 'never', outputFolder: 'playwright-report' }],
      ],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  expect: { timeout: 10_000 },
  timeout: 30_000,
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: startsLocalServer
    ? {
        command: serverCommand,
        url: `${localOrigin}/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      }
    : undefined,
})
