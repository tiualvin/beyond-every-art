import { defineConfig, devices } from '@playwright/test'

const localOrigin = 'http://127.0.0.1:3000'
const baseURL = process.env.PLAYWRIGHT_BASE_URL || localOrigin
const startsLocalServer = !process.env.PLAYWRIGHT_BASE_URL

/**
 * CI serves the exact artifact the production image runs: `node server.js` from
 * the standalone bundle, the same entry point as the Dockerfile's
 * `CMD ["node", "server.js"]`. `next start` is unsupported with
 * `output: 'standalone'` and Next.js warns about it, so using it here would
 * leave the shipped server untested. The standalone server takes its address
 * from HOSTNAME/PORT rather than CLI flags.
 *
 * Local runs keep the dev server for fast iteration.
 */
const productionServer = {
  command: 'node .next/standalone/server.js',
  env: { HOSTNAME: '127.0.0.1', NODE_ENV: 'production', PORT: '3000' },
}
const developmentServer = {
  command: 'pnpm exec next dev --hostname 127.0.0.1 --port 3000',
  env: {},
}

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
        ...(process.env.CI ? productionServer : developmentServer),
        url: `${localOrigin}/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      }
    : undefined,
})
