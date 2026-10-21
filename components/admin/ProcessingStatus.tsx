// Where this issue's PDF processing stands.
//
// Processing runs on the server, from a command, in its own container
// (`scripts/process-publication.ts`) — never from this screen, because a
// Publication autosaves every 800 ms and a run must not hang off a save. So
// the editor needs to see what the last run did without a terminal: how far
// it got, how it ended, and what to do next. That is this panel. It is
// read-only, as the build order says (`docs/PUBLICATION_SYSTEM.md`): the
// command is the only thing that starts a run.
//
// A server component, like `MediaUsage`: it reads with the signed-in user's
// access, so the rules in `collections/PublicationRuns.ts` hold here too, and
// it never throws — a panel that fails takes the edit view with it. It shows
// the run as of the page load; a run in progress says so and asks for a
// reload rather than polling.

import type { Payload, TypedUser } from 'payload'
import React from 'react'

import { isStale } from '../../lib/publications/processing/plan'

type Props = {
  payload: Payload
  user?: TypedUser | null
  data?: { id?: string | number; slug?: string | null } | null
}

type Run = {
  id: string | number
  status?: string | null
  progress?: number | null
  pagesDone?: number | null
  pageCount?: number | null
  currentPage?: number | null
  startedAt?: string | null
  finishedAt?: string | null
  updatedAt?: string | null
  error?: string | null
  rejection?: string | null
  source?: { kind?: string | null; name?: string | null } | null
}

const STATUS: Record<string, string> = {
  downloading: 'Downloading the PDF',
  validating: 'Checking the PDF',
  'extracting-links': 'Reading its links',
  'processing-pages': 'Drawing pages',
  'cleaning-up': 'Tidying up',
  ready: 'Ready',
  failed: 'Failed',
}

const REJECTION: Record<string, string> = {
  password: 'The PDF needs a password to open. Export it again without one.',
  unreadable: 'The file could not be read as a PDF. Export it again.',
  'too-many-pages': 'The PDF has more pages than processing accepts.',
  'too-large': 'The PDF is larger than processing accepts.',
}

const when = (value?: string | null) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleString('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'UTC',
      }) + ' UTC'
}

async function latestRun(
  payload: Payload,
  id: string | number,
  user?: TypedUser | null,
): Promise<Run | null | undefined> {
  try {
    const result = await payload.find({
      collection: 'publication-runs',
      where: { publication: { equals: id } },
      sort: '-createdAt',
      depth: 0,
      limit: 1,
      overrideAccess: false,
      user: user ?? undefined,
    })
    return (result.docs[0] as Run | undefined) ?? null
  } catch {
    // Unknown, not absent: saying "not processed yet" here would be wrong.
    return undefined
  }
}

async function readyPages(
  payload: Payload,
  id: string | number,
  user?: TypedUser | null,
): Promise<number | null> {
  try {
    const { totalDocs } = await payload.count({
      collection: 'publication-pages',
      where: {
        and: [{ publication: { equals: id } }, { status: { equals: 'ready' } }],
      },
      overrideAccess: false,
      user: user ?? undefined,
    })
    return totalDocs
  } catch {
    return null
  }
}

export async function ProcessingStatus({ payload, user, data }: Props) {
  const id = data?.id
  if (id === undefined || id === null || id === '') return null

  const [run, ready] = await Promise.all([
    latestRun(payload, id, user),
    readyPages(payload, id, user),
  ])
  if (run === undefined) return null
  const slug = data?.slug || '<slug>'

  if (!run) {
    return (
      <div className="bea-process">
        <p className="bea-process__heading">Not processed yet</p>
        <p className="bea-process__note">
          Copy the PDF into the media bucket under{' '}
          <code>publication-sources/</code>, then on the server run:
        </p>
        <pre className="bea-process__command">
          docker compose run --rm publications --publication {slug} --source-key
          publication-sources/&lt;file&gt;.pdf
        </pre>
      </div>
    )
  }

  const status = run.status ?? 'failed'
  // A run killed at its memory limit, or with its container, never says so.
  // Past the window the command itself uses to decide a run has stopped, say
  // it has, rather than "still running" until somebody starts another.
  const stopped = isStale(run, new Date())
  const active = status !== 'ready' && status !== 'failed' && !stopped
  const total = run.pageCount ?? null
  const started = when(run.startedAt)
  const finished = when(run.finishedAt)

  return (
    <div className="bea-process">
      <p className="bea-process__heading">
        {stopped ? 'Stopped' : (STATUS[status] ?? status)}
        {active && run.progress !== null && run.progress !== undefined
          ? ` — ${run.progress}%`
          : ''}
      </p>
      <ul className="bea-process__facts">
        {total !== null && (
          <li>
            {active
              ? `${run.pagesDone ?? 0} of ${total} pages done${
                  run.currentPage ? `, last page ${run.currentPage}` : ''
                }`
              : `${total} ${total === 1 ? 'page' : 'pages'} in the PDF`}
          </li>
        )}
        {ready !== null && !active && (
          <li>
            {ready} {ready === 1 ? 'page' : 'pages'} ready
          </li>
        )}
        {run.source?.name && <li>From {run.source.name}</li>}
        {started && <li>Started {started}</li>}
        {finished && <li>Finished {finished}</li>}
      </ul>
      {run.rejection && (
        <p className="bea-process__error">
          {REJECTION[run.rejection] ?? run.error}
        </p>
      )}
      {!run.rejection && run.error && (
        <p className="bea-process__error">{run.error}</p>
      )}
      {stopped && (
        <p className="bea-process__error">
          It stopped reporting progress
          {when(run.updatedAt) ? ` at ${when(run.updatedAt)}` : ''}, at{' '}
          {run.pagesDone ?? 0} of {total ?? '?'} pages, without finishing — most
          likely killed at its memory limit or with its container.
        </p>
      )}
      <p className="bea-process__note">
        {active
          ? 'Still running. Reload to see how far it has got.'
          : status === 'failed' || stopped
            ? 'Run the command again to retry: pages already drawn from the same file are kept.'
            : 'Readers see none of this until the publication launches.'}
      </p>
    </div>
  )
}

export default ProcessingStatus
