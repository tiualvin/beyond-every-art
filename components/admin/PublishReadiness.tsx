'use client'

// What is missing, before it is missing on the live site.
//
// Nothing stopped an article being published with no standfirst, no cover and
// no tags. Each of those is invisible in the editor and obvious on the site: a
// card with a blank summary in the archive, a listing with an empty frame, an
// article that reaches no tag page and no "read next" list. The dashboard
// reports them afterwards, across the whole publication; this is the same facts
// at the moment somebody can still act on them cheaply.
//
// Deliberately not validation. A draft is allowed to be incomplete — that is
// what a draft is — and making any of these `required` would refuse the save an
// editor makes halfway through a sentence. It also must not refuse a publish:
// a piece that genuinely wants no cover is a decision, and a CMS that argues
// with it is one an editor learns to work around. So this states what is
// missing and what will happen, and leaves the button alone.

import { useAllFormFields } from '@payloadcms/ui'
import React from 'react'

type Check = {
  /** True when the thing is present. */
  ok: boolean
  /** What is missing, and what it costs — never a bare field name. */
  missing: string
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

export function PublishReadiness() {
  const [fields] = useAllFormFields()

  const value = (name: string): unknown =>
    (fields?.[name] as { value?: unknown } | undefined)?.value

  const status = value('_status')
  const publishedAt = value('publishedAt')

  const scheduled =
    typeof publishedAt === 'string' &&
    publishedAt !== '' &&
    Date.parse(publishedAt) > Date.now()

  const checks: Check[] = [
    {
      ok: !isEmpty(value('excerpt')),
      missing:
        'No standfirst — its card, feed item and share preview will have no summary line.',
    },
    {
      ok: !isEmpty(value('featuredImage')),
      missing: 'No cover — its card renders without an image in every listing.',
    },
    {
      ok: !isEmpty(value('tags')),
      missing:
        'No tags — it will reach no tag archive and no “read next” list.',
    },
    {
      ok: !isEmpty(value('authors')),
      missing: 'No byline — it will publish with no author credited.',
    },
  ]

  const outstanding = checks.filter((check) => !check.ok)

  return (
    <div className="bea-ready">
      {scheduled && (
        <p className="bea-ready__note">
          <strong>Scheduled.</strong> This stays off the site until the publish
          date. Nothing wakes up to release it — it appears the first time a
          page is rebuilt after that moment, within about ten minutes.
        </p>
      )}

      {status === 'published' && !scheduled && outstanding.length === 0 && (
        <p className="bea-ready__note bea-ready__note--ok">
          Live and complete.
        </p>
      )}

      {outstanding.length > 0 && (
        <>
          <p className="bea-ready__heading">
            {status === 'published' ? 'Live, and missing' : 'Before publishing'}
          </p>
          <ul className="bea-ready__list">
            {outstanding.map((check) => (
              <li key={check.missing}>{check.missing}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

export default PublishReadiness
