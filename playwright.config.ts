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
/**
 * The suite drives every public flow from one address, and the rate limiters
 * (`lib/security/rate-limit.ts`) key on exactly that. Loopback sends no
 * `X-Forwarded-For`, so all of it lands in one bucket: the signup tests alone
 * come close to the production allowance of ten an hour, and a retried run goes
 * past it — which would fail as a rate limit rather than as the bug it looks
 * like. Raised here rather than weakened in the code, so what ships stays tight.
 */
const rateLimitOverrides = {
  RATE_LIMIT_SIGNUP_PER_HOUR: '10000',
  RATE_LIMIT_SEARCH_PER_MINUTE: '10000',
  RATE_LIMIT_SEARCH_SUGGEST_PER_MINUTE: '10000',
  RATE_LIMIT_MCP_PER_MINUTE: '10000',
  // `mcp.spec.ts` presents wrong keys on purpose, and the production allowance
  // is ten failures per source address per fifteen minutes. Loopback sends no
  // `X-Forwarded-For`, so the whole suite shares one bucket — and once it is
  // spent every MCP request from this address is refused, valid key included,
  // which would turn two retries into a cascade of unrelated failures. The
  // limiter's own behaviour is covered in `tests/mcp/rate-limit.test.ts`.
  RATE_LIMIT_MCP_AUTH_FAILURES: '10000',
  // `oauth.spec.ts` signs in once per test to reach the consent screen, and CI
  // retries twice — which goes past the production allowance of twenty logins
  // per address per fifteen minutes and fails as a rate limit rather than as
  // the bug it looks like.
  RATE_LIMIT_LOGIN_PER_15M: '10000',
}

/**
 * The MCP endpoint is not mounted unless this is set, so without it the suite
 * would assert against Payload's 404 and pass while proving nothing. Enabling
 * it here rather than in the seed keeps it to the test server: neither the
 * Docker image nor a deployment gains an endpoint from a test config.
 */
const mcpEnvironment = {
  MCP_ENABLED: '1',
  MCP_OAUTH_ENABLED: '1',
  // The OAuth layer derives its issuer from CMS_ADDRESS and refuses to serve
  // anything without one — deliberately, so that a misconfigured deployment
  // advertises nothing rather than advertising a `Host` header an attacker
  // chose. The suite drives the app directly, so the issuer is the loopback
  // address the test server actually answers on.
  CMS_ADDRESS: '127.0.0.1:3000',
}

const productionServer = {
  command: 'node .next/standalone/server.js',
  env: {
    HOSTNAME: '127.0.0.1',
    NODE_ENV: 'production',
    PORT: '3000',
    ...mcpEnvironment,
    ...rateLimitOverrides,
  },
}
const developmentServer = {
  command: 'pnpm exec next dev --hostname 127.0.0.1 --port 3000',
  env: { ...mcpEnvironment, ...rateLimitOverrides },
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
