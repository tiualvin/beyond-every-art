import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ProcessingStatus } from '../../components/admin/ProcessingStatus'

type Find = (args: { collection: string }) => Promise<unknown>

/** A Payload stand-in with the two reads the panel makes. */
function payload(run: object | null | Error, ready = 0) {
  const find: Find = async () => {
    if (run instanceof Error) throw run
    return { docs: run ? [run] : [] }
  }
  return {
    find,
    count: async () => ({ totalDocs: ready }),
  } as never
}

async function render(run: object | null | Error, ready = 0) {
  const element = await ProcessingStatus({
    payload: payload(run, ready),
    user: { id: 2, role: 'editor' } as never,
    data: { id: 7, slug: 'spring-2027' },
  })
  return element ? renderToStaticMarkup(element) : ''
}

describe('ProcessingStatus', () => {
  it('says how to process an issue that never has been', async () => {
    const html = await render(null)
    expect(html).toContain('Not processed yet')
    expect(html).toContain('--publication spring-2027')
    expect(html).toContain('publication-sources/')
  })

  it('shows a run in progress, and that it needs a reload', async () => {
    const html = await render({
      id: 1,
      status: 'processing-pages',
      progress: 40,
      pagesDone: 4,
      pageCount: 10,
      currentPage: 4,
    })
    expect(html).toContain('Drawing pages — 40%')
    expect(html).toContain('4 of 10 pages done, last page 4')
    expect(html).toContain('Reload')
  })

  it('names a rejected file in terms an editor can act on', async () => {
    const html = await render({
      id: 1,
      status: 'failed',
      rejection: 'password',
      error: 'pdfinfo: Incorrect password',
    })
    expect(html).toContain('Export it again without one')
    expect(html).not.toContain('pdfinfo')
  })

  it('reports a finished run and how many pages are ready', async () => {
    const html = await render(
      {
        id: 1,
        status: 'ready',
        pageCount: 8,
        finishedAt: '2026-10-20T12:00:00Z',
      },
      8,
    )
    expect(html).toContain('Ready')
    expect(html).toContain('8 pages ready')
    expect(html).toContain('20 Oct 2026')
  })

  it('renders nothing, rather than a wrong answer, when it cannot read runs', async () => {
    // An author, say, whom the runs collection refuses. The panel must never
    // take the edit view down with it, and "not processed yet" would be false.
    expect(await render(new Error('Forbidden'))).toBe('')
  })

  it('renders nothing for a document not yet saved', async () => {
    const element = await ProcessingStatus({
      payload: payload(null),
      data: {},
    })
    expect(element).toBeNull()
  })
})
