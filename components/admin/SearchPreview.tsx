'use client'

// What this document will look like in a search result, while it is written.
//
// The two metadata fields carried descriptions saying what they were for and
// that the snippet runs to "around 155 characters", and then offered a plain
// box with no counter and no example. So the guidance was there and the means
// to follow it was not: the only way to find out whether a description fitted
// was to publish it and search for it.
//
// This draws the result instead, from the values in the form as they are typed,
// with the same fallbacks the site itself applies — a document with no
// `metaTitle` shows its title here, because that is what a crawler will show.
// An editor who leaves both fields empty sees the real consequence of that,
// which is usually fine and occasionally not.
//
// A `ui` field rather than a replacement for the inputs. Overriding a field's
// own component means owning its validation, its error state and its
// server/client boundary forever; this reads the form and renders beside them,
// so the fields stay Payload's.

import { useAllFormFields } from '@payloadcms/ui'
import React from 'react'

/**
 * Where a search result stops showing the rest.
 *
 * Both are the widely observed truncation points rather than hard limits —
 * search engines measure pixels, not characters, and reserve the right to
 * rewrite either. So this warns and never blocks: it is a ruler, not a rule.
 */
const TITLE_LIMIT = 60
const DESCRIPTION_LIMIT = 155

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function Meter({
  label,
  value,
  limit,
}: {
  label: string
  value: string
  limit: number
}) {
  const over = value.length > limit
  return (
    <p className={`bea-seo__meter${over ? ' bea-seo__meter--over' : ''}`}>
      <span>{label}</span>
      <span>
        {value.length} / {limit}
        {over ? ' — will be cut short' : ''}
      </span>
    </p>
  )
}

export function SearchPreview() {
  const [fields] = useAllFormFields()

  const get = (name: string): string =>
    text((fields?.[name] as { value?: unknown } | undefined)?.value)

  const title = get('metaTitle') || get('title')
  const description = get('metaDescription') || get('excerpt')
  const slug = get('slug')

  return (
    <div className="bea-seo">
      <p className="bea-seo__caption">
        How this is likely to appear in a search result. Both fields fall back
        to the article, so this is what a crawler sees whether or not they are
        filled in.
      </p>

      <div className="bea-seo__card">
        <span className="bea-seo__url">
          beyondeveryart.com{slug ? `/${slug}/` : '/…'}
        </span>
        <span className="bea-seo__title">
          {title || 'This document has no title yet'}
        </span>
        <span className="bea-seo__desc">
          {description ||
            'No description and no standfirst — a search engine will pick a sentence out of the body instead.'}
        </span>
      </div>

      <Meter label="Title" value={title} limit={TITLE_LIMIT} />
      <Meter
        label="Description"
        value={description}
        limit={DESCRIPTION_LIMIT}
      />
    </div>
  )
}

export default SearchPreview
