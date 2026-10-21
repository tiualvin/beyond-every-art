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

import { spawn } from 'node:child_process'
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

/**
 * How much of a tool's stderr is kept: the end, where the reason for a failure
 * is. Nothing a tool writes to stderr limits the run — a page Poppler draws
 * perfectly well can still print a warning for every bad token on it, and an
 * earlier version failed such pages for writing too much.
 */
const STDERR_KEPT = 64 * 1024

/**
 * Runs one tool and returns its stdout. Exported for its tests; the functions
 * below are what the rest of processing calls.
 */
export function runTool(
  tool: string,
  args: string[],
  options: RunOptions,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(tool, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    const out: Buffer[] = []
    let outBytes = 0
    let err = ''
    let settled = false
    let stopped: ToolFailed | null = null
    const settle = (finish: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      finish()
    }
    // Settles at once rather than waiting for the pipes to close: a process
    // the tool started can hold them open after the tool itself is killed.
    const stop = (reason: ToolFailed) => {
      if (stopped) return
      stopped = reason
      child.kill('SIGKILL')
      child.stdout.destroy()
      child.stderr.destroy()
      settle(() => reject(reason))
    }
    const timer = setTimeout(
      () =>
        stop(
          new ToolFailed(
            tool,
            `${tool} took longer than ${options.timeoutMs} ms.`,
          ),
        ),
      options.timeoutMs,
    )

    child.stdout.on('data', (chunk: Buffer) => {
      outBytes += chunk.length
      if (outBytes > options.maxBuffer) {
        stop(
          new ToolFailed(
            tool,
            `${tool} wrote more than ${options.maxBuffer} bytes.`,
          ),
        )
        return
      }
      out.push(chunk)
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      err = (err + chunk).slice(-STDERR_KEPT)
    })
    child.on('error', (error: NodeJS.ErrnoException) =>
      settle(() =>
        reject(
          error.code === 'ENOENT'
            ? new ToolFailed(
                tool,
                `${tool} is not installed; install poppler-utils and qpdf.`,
              )
            : new ToolFailed(tool, `${tool} could not start: ${error.message}`),
        ),
      ),
    )
    child.on('close', (code, signal) =>
      settle(() => {
        if (stopped) return reject(stopped)
        if (code === 0) return resolve(Buffer.concat(out).toString('utf8'))
        reject(
          Object.assign(
            new ToolFailed(
              tool,
              `${tool} failed: ${tail(err) || `exit ${code ?? signal}`}`,
            ),
            { stderr: err },
          ),
        )
      }),
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
    stdout = await runTool(
      'pdfinfo',
      ['-f', '1', '-l', '1000000', '-box', file],
      {
        timeoutMs: 60_000,
        maxBuffer: 64 * MiB,
      },
    )
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
  const xhtml = await runTool(
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
  const stdout = await runTool(
    'qpdf',
    [
      '--json=2',
      '--json-key=pages',
      '--json-key=qpdf',
      // Object dictionaries only: a page's image data has no links in it.
      '--json-stream-data=none',
      // qpdf exits 3 when it repaired anything, which Poppler repairs too
      // without a word: a file every other tool here reads would otherwise
      // fail at its links, on every run. The JSON is complete either way.
      '--warning-exit-0',
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
  await runTool(
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
      // Otherwise the width is measured before the page's /Rotate is
      // applied, and a turned page comes out the wrong width: a portrait
      // page stored turned drew 30% narrower than its neighbours, and a
      // landscape one wider than the rendition allows.
      '-scale-dimension-before-rotation',
      file,
      prefix,
    ],
    { timeoutMs: 180_000, maxBuffer: 1 * MiB },
  )
  return `${prefix}.png`
}
