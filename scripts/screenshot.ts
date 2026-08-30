// Full-page screenshots for manual visual QA (staging/production spot checks,
// before/after comparisons like the ones under docs/assets/frontend-fixes).
//
//   pnpm screenshot https://staging.beyondeveryart.com
//   pnpm screenshot https://staging.beyondeveryart.com homepage.png
//   pnpm screenshot https://staging.beyondeveryart.com mobile.png --viewport=390x844
//   pnpm screenshot https://staging.beyondeveryart.com above-fold.png --no-full-page
//
// Scrolls to the bottom before capturing so lazy-loaded images and
// intersection-observer sections have already fired, then waits for network
// idle and for every <img> to finish loading. Capturing immediately after
// `load` reliably misses everything below the fold on this site.
//
// In the Claude Code web/remote sandbox, outbound HTTPS goes through an agent
// proxy (HTTPS_PROXY) that tunnels TLS over a WebSocket relay to an egress
// proxy. That relay resets Chromium's connections mid-handshake — plain curl
// and TLS 1.2 both go through fine, but Chromium's TLS 1.3 handshake
// (early data / 0-RTT) does not survive the tunnel. When HTTPS_PROXY is set,
// this script disables TLS 1.3 early data and caps Chromium at TLS 1.2, which
// is the workaround that fixed it. Outside that sandbox it launches with no
// special flags. If screenshots start failing again with
// net::ERR_CONNECTION_RESET, check
// `curl -sS "$HTTPS_PROXY/__agentproxy/status"` before assuming this
// workaround has stopped working — recentRelayFailures names the host and
// reason.

import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import { chromium, type Page } from '@playwright/test'

/**
 * Playwright resolves the browser build pinned to the installed
 * @playwright/test version. This sandbox's pre-cached browsers can lag that
 * pin (a devDependency bump here doesn't re-download them), so when the
 * pinned build is missing this falls back to whatever full Chromium build is
 * actually cached — the "chromium-*" ones, not "chromium_headless_shell-*",
 * which is a different, more limited binary.
 */
function findCachedChromium(): string | undefined {
  const browsersPath =
    process.env.PLAYWRIGHT_BROWSERS_PATH ||
    join(homedir(), '.cache', 'ms-playwright')
  if (!existsSync(browsersPath)) return undefined

  const candidates = readdirSync(browsersPath)
    .filter((name) => /^chromium-\d+$/.test(name))
    .sort()
    .reverse()

  for (const name of candidates) {
    const executable = join(browsersPath, name, 'chrome-linux', 'chrome')
    if (existsSync(executable)) return executable
  }
  return undefined
}

interface Cli {
  url: string
  output: string
  width: number
  height: number
  fullPage: boolean
}

function parseArgs(argv: string[]): Cli {
  const positional = argv.filter((arg) => !arg.startsWith('--'))
  const flags = new Set(argv.filter((arg) => arg.startsWith('--')))
  const viewportFlag = argv.find((arg) => arg.startsWith('--viewport='))

  const url = positional[0]
  if (!url) {
    console.error(
      'Usage: pnpm screenshot <url> [output.png] [--viewport=WIDTHxHEIGHT] [--no-full-page]',
    )
    process.exit(1)
  }

  const [width, height] = (
    viewportFlag?.slice('--viewport='.length) ?? '1440x900'
  )
    .split('x')
    .map(Number)

  return {
    url,
    output: positional[1] ?? defaultOutputPath(url),
    width: width || 1440,
    height: height || 900,
    fullPage: !flags.has('--no-full-page'),
  }
}

function defaultOutputPath(url: string): string {
  const { hostname, pathname } = new URL(url)
  const slug =
    `${hostname}${pathname}`
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '') || 'homepage'
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  return join('screenshots', `${slug}-${timestamp}.png`)
}

async function autoScroll(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const distance = 400
      let total = 0
      const timer = setInterval(() => {
        window.scrollBy(0, distance)
        total += distance
        if (total >= document.body.scrollHeight) {
          clearInterval(timer)
          resolve()
        }
      }, 200)
    })
  })
}

async function waitForImages(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await Promise.all(
      Array.from(document.images).map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise((resolve) => {
              img.onload = resolve
              img.onerror = resolve
            }),
      ),
    )
  })
}

async function main() {
  const cli = parseArgs(process.argv.slice(2))

  const sandboxed = Boolean(process.env.HTTPS_PROXY)
  const args = sandboxed
    ? [
        '--disable-background-networking',
        '--disable-component-update',
        '--disable-domain-reliability',
        '--disable-features=TLS13EarlyData,EncryptedClientHello',
        '--ssl-version-max=tls1.2',
      ]
    : []

  let browser
  try {
    browser = await chromium.launch({ args })
  } catch (error) {
    const executablePath = findCachedChromium()
    if (!executablePath) throw error
    console.error(
      `Pinned Chromium build missing; falling back to cached build at ${executablePath}`,
    )
    browser = await chromium.launch({ args, executablePath })
  }

  const page = await browser.newPage({
    viewport: { width: cli.width, height: cli.height },
  })

  try {
    const response = await page.goto(cli.url, {
      waitUntil: 'commit',
      timeout: 20_000,
    })
    await page.waitForLoadState('load', { timeout: 20_000 })

    if (cli.fullPage) {
      await autoScroll(page)
      await page
        .waitForLoadState('networkidle', { timeout: 20_000 })
        .catch(() => {})
      await waitForImages(page)
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.waitForTimeout(500)
    }

    mkdirSync(dirname(cli.output), { recursive: true })
    await page.screenshot({ path: cli.output, fullPage: cli.fullPage })
    console.log(
      `Saved ${cli.output} (status ${response?.status()}, "${await page.title()}")`,
    )
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
