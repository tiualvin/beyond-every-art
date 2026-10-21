import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  inspectPdf,
  PdfRejected,
  readLinks,
  readPageText,
  renderPage,
  runTool,
} from '../../../lib/publications/processing/tools'
import {
  buildSamplePdf,
  samplePages,
} from '../../../lib/publications/sample-pdf'

// These run the real binaries, because a pipeline tested only against mocks of
// Poppler is tested against what someone believed Poppler does. CI installs
// them in the `checks` job; on a machine without them the suite is skipped
// locally and fails in CI, so a missing install cannot pass as green.
const TOOLS = ['pdfinfo', 'pdftotext', 'pdftoppm', 'qpdf']
const installed = TOOLS.every((tool) => {
  try {
    execFileSync('sh', ['-c', `command -v ${tool}`], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})

describe('runTool', () => {
  const sh = (
    script: string,
    options = { timeoutMs: 10_000, maxBuffer: 1024 },
  ) => runTool('sh', ['-c', script], options)

  it('returns what the tool wrote to stdout', async () => {
    await expect(sh('printf ok')).resolves.toBe('ok')
  })

  it('never fails a tool for what it writes to stderr', async () => {
    // Poppler draws a page with a damaged content stream and warns once per
    // bad token: megabytes, with exit status 0. Counted against the output
    // ceiling, that failed a page that had drawn perfectly well.
    await expect(
      sh("head -c 3000000 /dev/zero | tr '\\0' w >&2; printf drawn"),
    ).resolves.toBe('drawn')
  })

  it('stops a tool that writes more than it may to stdout', async () => {
    await expect(sh('head -c 4096 /dev/zero')).rejects.toThrow(
      /wrote more than 1024 bytes/,
    )
  })

  it('stops a tool that runs past its time', async () => {
    await expect(
      sh('sleep 5', { timeoutMs: 100, maxBuffer: 1024 }),
    ).rejects.toThrow(/took longer than 100 ms/)
  })

  it('reports a failure with the end of what the tool said', async () => {
    await expect(sh('echo first >&2; echo why >&2; exit 2')).rejects.toThrow(
      /failed: first\nwhy/,
    )
  })

  it('says when a tool is not installed', async () => {
    await expect(
      runTool('no-such-pdf-tool', [], { timeoutMs: 1000, maxBuffer: 1024 }),
    ).rejects.toThrow(/not installed/)
  })
})

describe('the PDF tools in CI', () => {
  it.runIf(process.env.CI)('are installed', () => {
    expect(installed, `install ${TOOLS.join(', ')} in the checks job`).toBe(
      true,
    )
  })
})

const SITE = 'https://www.beyondeveryart.com'

describe.skipIf(!installed)('the PDF tools, on the generated sample', () => {
  let directory: string
  let sample: string

  beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), 'publication-tools-'))
    sample = join(directory, 'sample.pdf')
    writeFileSync(sample, buildSamplePdf(samplePages(6)))
  })

  afterAll(() => rmSync(directory, { recursive: true, force: true }))

  it('reads every page, the fifth turned to landscape', async () => {
    const info = await inspectPdf(sample)
    expect(info.pageCount).toBe(6)
    expect(info.encrypted).toBe(false)
    expect(info.pages.map((page) => [page.width, page.height])).toEqual([
      [595, 842],
      [595, 842],
      [595, 842],
      [595, 842],
      [842, 595],
      [595, 842],
    ])
  })

  it('reads a page’s words in order, placed where they were drawn', async () => {
    const info = await inspectPdf(sample)
    const text = await readPageText(sample, info.pages[1]!)
    expect(text.text).toMatch(/^Sample issue, page 2\n\nA generated sample/)
    const heading = text.words[0]!
    expect(heading.text).toBe('Sample')
    expect(heading.x).toBeCloseTo(72 / 595, 2)
  })

  it('finds each kind of link and sorts it', async () => {
    const info = await inspectPdf(sample)
    const links = await readLinks(sample, info.pages, SITE)
    expect(links.map((link) => [link.page, link.target])).toEqual([
      [
        2,
        {
          kind: 'uri',
          uri: 'https://example.com/exhibition/',
          link: { kind: 'external', href: 'https://example.com/exhibition/' },
        },
      ],
      [
        2,
        {
          kind: 'uri',
          uri: 'https://www.beyondeveryart.com/about/',
          link: { kind: 'internal', href: '/about/' },
        },
      ],
      [2, { kind: 'page', page: 3 }],
      [
        2,
        {
          kind: 'uri',
          uri: 'javascript:alert(1)',
          link: { kind: 'refused', reason: 'scheme' },
        },
      ],
    ])
  })

  it('renders a page at the width asked, the height following the page', async () => {
    const info = await inspectPdf(sample)
    const portrait = await sharp(
      await renderPage(sample, info.pages[0]!, 400, directory),
    ).metadata()
    const landscape = await sharp(
      await renderPage(sample, info.pages[4]!, 400, directory),
    ).metadata()
    // Poppler rounds the height its own way (566.05 became 567 in 24.02), so
    // allow a pixel either side rather than pin one version's rounding.
    expect(portrait.width).toBe(400)
    expect(Math.abs(portrait.height - (400 * 842) / 595)).toBeLessThanOrEqual(1)
    expect(landscape.width).toBe(400)
    expect(Math.abs(landscape.height - (400 * 595) / 842)).toBeLessThanOrEqual(
      1,
    )
  })

  it('draws the words, not only the shapes around them', async () => {
    // The sample sets its text in Helvetica without embedding it, as some
    // exports do. With no fonts installed Poppler draws such words as nothing
    // and says so only on stderr: the first run in the Alpine image produced
    // pages of blank panels while the text layer read fine. So look for ink
    // where the heading sits — on the pale panel, 12% in and 6.5% down.
    const info = await inspectPdf(sample)
    const png = await renderPage(sample, info.pages[1]!, 400, directory)
    const { width, height } = await sharp(png).metadata()
    const heading = await sharp(png)
      .extract({
        left: Math.round(width * 0.12),
        top: Math.round(height * 0.065),
        width: Math.round(width * 0.3),
        height: Math.round(height * 0.025),
      })
      .greyscale()
      .stats()
    // The panel alone is about 235; a drawn letter is near black.
    expect(heading.channels[0]!.min).toBeLessThan(100)
  })

  it('reads the links of a file qpdf has to repair', async () => {
    // Every cross-reference offset moved: Poppler repairs it silently and
    // qpdf repairs it too, but exits 3 for having done so. Treated as a
    // failure, no page of such a file could ever be processed.
    const damaged = join(directory, 'damaged.pdf')
    const shifted = buildSamplePdf(samplePages(3))
      .toString('latin1')
      .replace(
        /^(\d{10}) 00000 n $/gm,
        (_, offset: string) =>
          `${String(Number(offset) + 7).padStart(10, '0')} 00000 n `,
      )
    writeFileSync(damaged, Buffer.from(shifted, 'latin1'))
    const info = await inspectPdf(damaged)
    expect(info.pageCount).toBe(3)
    const links = await readLinks(damaged, info.pages, SITE)
    expect(links.map((link) => link.target.kind)).toEqual([
      'uri',
      'uri',
      'page',
      'uri',
    ])
  })

  it('reads a file with only an owner password, and says it is encrypted', async () => {
    const locked = join(directory, 'owner.pdf')
    execFileSync('qpdf', [
      '--encrypt',
      '',
      'owner',
      '256',
      '--print=none',
      '--',
      sample,
      locked,
    ])
    const info = await inspectPdf(locked)
    expect(info.encrypted).toBe(true)
    expect(info.pageCount).toBe(6)
  })

  it('refuses a file that needs a password to open', async () => {
    const locked = join(directory, 'user.pdf')
    execFileSync('qpdf', [
      '--encrypt',
      'secret',
      'owner',
      '256',
      '--',
      sample,
      locked,
    ])
    await expect(inspectPdf(locked)).rejects.toMatchObject({
      name: 'PdfRejected',
      reason: 'password',
    })
  })

  it('refuses a file that is not a PDF', async () => {
    const junk = join(directory, 'junk.pdf')
    writeFileSync(junk, '<html>not a pdf</html>')
    const rejection = await inspectPdf(junk).catch((error: unknown) => error)
    expect(rejection).toBeInstanceOf(PdfRejected)
    expect(rejection).toMatchObject({ reason: 'unreadable' })
  })
})
