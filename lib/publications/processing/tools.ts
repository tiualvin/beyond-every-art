// Runs Poppler and qpdf on a PDF that is already on disk.
//
// Each call is one process with arguments passed as an array — never a shell,
// so nothing in a file name or an option is ever interpreted — and with a
// timeout and an output ceiling, because a hostile or broken PDF can make a
// renderer spin or a dump grow without end, and this runs on the same small
// server as the site. What the tools print is read by `./inspect.ts`.
//
// The binaries come from `poppler-utils` and `qpdf`, installed in the
// Dockerfile's `migrator` stage and in CI's `checks` job.

import { execFile } from 'node:child_process'
import { join } from 'node:path'

import {
  type DocumentInfo,
  type ExtractedLink,
  extractLinks,
  type PageInfo,
  type PageText,
  parseBboxLayout,
  parsePdfInfo,
} from './inspect'

/** Why a PDF cannot be processed, in terms an editor can act on. */
export type RejectionReason =
  | 'password' // needs a password to open
  | 'unreadable' // not a PDF, or damaged past what Poppler repairs
  | 'too-many-pages'
  | 'too-large'

export class PdfRejected extends Error {
  constructor(
    readonly reason: RejectionReason,
    message: string,
  ) {
    super(message)
    this.name = 'PdfRejected'
  }
}

export class ToolFailed extends Error {
  constructor(
    readonly tool: string,
    message: string,
  ) {
    super(message)
    this.name = 'ToolFailed'
  }
}

type RunOptions = { timeoutMs: number; maxBuffer: number }

const MiB = 1024 * 1024

/** The last few lines a tool wrote to stderr: enough to act on, never a flood. */
function tail(text: string, lines = 5): string {
  return text.trim().split(/\r?\n/).slice(-lines).join('\n')
}

function run(
  tool: string,
  args: string[],
  options: RunOptions,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      tool,
      args,
      {
        encoding: 'utf8',
        timeout: options.timeoutMs,
        maxBuffer: options.maxBuffer,
        killSignal: 'SIGKILL',
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (!error) return resolve(stdout)
        const detail = tail(stderr) || error.message
        if ('code' in error && error.code === 'ENOENT') {
          return reject(
            new ToolFailed(
              tool,
              `${tool} is not installed; install poppler-utils and qpdf.`,
            ),
          )
        }
        if (error.killed) {
          return reject(
            new ToolFailed(
              tool,
              `${tool} took longer than ${options.timeoutMs} ms.`,
            ),
          )
        }
        if (
          'code' in error &&
          error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'
        ) {
          return reject(
            new ToolFailed(
              tool,
              `${tool} wrote more than ${options.maxBuffer} bytes.`,
            ),
          )
        }
        reject(
          Object.assign(new ToolFailed(tool, `${tool} failed: ${detail}`), {
            stderr,
          }),
        )
      },
    )
  })
}

/**
 * Reads the page count, every page's boxes and rotation, and encryption.
 *
 * A file that needs a password to open, or that is not a PDF at all, is a
 * rejection rather than a failure: the run ends with the reason, and running it
 * again will not help until someone replaces the file.
 */
export async function inspectPdf(file: string): Promise<DocumentInfo> {
  let stdout: string
  try {
    // `-l` past the last page is clamped, so one call reads every page.
    stdout = await run('pdfinfo', ['-f', '1', '-l', '1000000', '-box', file], {
      timeoutMs: 60_000,
      maxBuffer: 64 * MiB,
    })
  } catch (error) {
    if (
      error instanceof ToolFailed &&
      error.tool === 'pdfinfo' &&
      /not installed/.test(error.message)
    ) {
      throw error
    }
    const stderr = (error as { stderr?: string }).stderr ?? ''
    if (/Incorrect password/i.test(stderr)) {
      throw new PdfRejected(
        'password',
        'The PDF needs a password to open. Export it without one.',
      )
    }
    throw new PdfRejected(
      'unreadable',
      `Poppler could not read the file as a PDF: ${tail(stderr, 3) || (error as Error).message}`,
    )
  }
  try {
    return parsePdfInfo(stdout)
  } catch (error) {
    throw new PdfRejected('unreadable', (error as Error).message)
  }
}

/** One page's words and where they sit, measured on the page as displayed. */
export async function readPageText(
  file: string,
  page: PageInfo,
): Promise<PageText> {
  const n = String(page.number)
  const xhtml = await run(
    'pdftotext',
    ['-f', n, '-l', n, '-bbox-layout', '-cropbox', '-enc', 'UTF-8', file, '-'],
    { timeoutMs: 120_000, maxBuffer: 64 * MiB },
  )
  return parseBboxLayout(xhtml, page)
}

/** Every link annotation in the file, classified and placed on its page. */
export async function readLinks(
  file: string,
  pages: PageInfo[],
  siteUrl?: string,
): Promise<ExtractedLink[]> {
  const stdout = await run(
    'qpdf',
    [
      '--json=2',
      '--json-key=pages',
      '--json-key=qpdf',
      // Object dictionaries only: a page's image data has no links in it.
      '--json-stream-data=none',
      file,
    ],
    { timeoutMs: 300_000, maxBuffer: 256 * MiB },
  )
  return extractLinks(JSON.parse(stdout), pages, siteUrl)
}

/**
 * Renders one page to a PNG `width` pixels wide, the height following the
 * page. Returns the path written. The crop box is what is rendered, so bleed
 * and printer's marks never reach a reader.
 */
export async function renderPage(
  file: string,
  page: PageInfo,
  width: number,
  directory: string,
): Promise<string> {
  const n = String(page.number)
  const prefix = join(directory, `page-${n.padStart(4, '0')}`)
  await run(
    'pdftoppm',
    [
      '-f',
      n,
      '-l',
      n,
      '-singlefile',
      '-cropbox',
      '-png',
      '-scale-to-x',
      String(width),
      '-scale-to-y',
      '-1',
      file,
      prefix,
    ],
    { timeoutMs: 180_000, maxBuffer: 1 * MiB },
  )
  return `${prefix}.png`
}
