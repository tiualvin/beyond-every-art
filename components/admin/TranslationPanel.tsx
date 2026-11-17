'use client'

// Where this language's version of the article stands.
//
// The edit screen shows one language at a time and the Publish button acts on
// the one showing, so an editor switching to Spanish needs to see at a glance
// what Spanish has: nothing yet, a draft, a live translation or a scheduled
// one — and whether the English it was translated from has been republished
// since, which is the one fact the form cannot show by itself (it holds only
// the language being edited).
//
// Follows the three rules in docs/EDITORIAL_ADMIN.md: it reads with the
// editor's own session (a same-origin REST call, so access control holds), it
// never throws — a failed read leaves the comparison out — and it states
// rather than refuses.

import {
  useAllFormFields,
  useConfig,
  useDocumentInfo,
  useLocale,
} from '@payloadcms/ui'
import React, { useEffect, useState } from 'react'

const DEFAULT_LOCALE = 'en'

function formatWhen(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  const at = new Date(value)
  return Number.isNaN(at.getTime())
    ? null
    : at.toLocaleString('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'UTC',
      }) + ' UTC'
}

export function TranslationPanel() {
  const locale = useLocale()
  const { id } = useDocumentInfo()
  const { config } = useConfig()
  const [fields] = useAllFormFields()
  const [english, setEnglish] = useState<{
    modifiedAt: string | null
    status: string | null
  } | null>(null)

  const code = locale?.code ?? DEFAULT_LOCALE
  const label =
    typeof locale?.label === 'string' ? locale.label : code.toUpperCase()

  useEffect(() => {
    if (code === DEFAULT_LOCALE || id === undefined || id === null) return
    let cancelled = false
    const api = config?.routes?.api ?? '/api'
    fetch(
      `${api}/posts/${id}?locale=${DEFAULT_LOCALE}&depth=0` +
        '&select[modifiedAt]=true&select[updatedAt]=true&select[_status]=true',
      { credentials: 'include' },
    )
      .then((response) => (response.ok ? response.json() : null))
      .then((doc: Record<string, unknown> | null) => {
        if (cancelled || !doc) return
        const modifiedAt =
          (typeof doc.modifiedAt === 'string' && doc.modifiedAt) ||
          (typeof doc.updatedAt === 'string' && doc.updatedAt) ||
          null
        setEnglish({
          modifiedAt,
          status: typeof doc._status === 'string' ? doc._status : null,
        })
      })
      .catch(() => {
        // The comparison is a courtesy; without it the panel still says where
        // this translation stands.
      })
    return () => {
      cancelled = true
    }
  }, [code, id, config?.routes?.api])

  if (code === DEFAULT_LOCALE) return null

  const value = (name: string): unknown =>
    (fields?.[name] as { value?: unknown } | undefined)?.value

  const status = value('translationStatus')
  const publishedAt = value('translationPublishedAt')
  const slug = value('slug')
  const translatedAt = value('translatedFrom.englishModifiedAt')
  const scheduled =
    status === 'published' &&
    typeof publishedAt === 'string' &&
    Date.parse(publishedAt) > Date.now()

  const behind =
    english?.modifiedAt &&
    typeof translatedAt === 'string' &&
    Date.parse(english.modifiedAt) > Date.parse(translatedAt)

  const statement =
    status === 'published'
      ? scheduled
        ? `${label}: scheduled for ${formatWhen(publishedAt)}.`
        : `${label}: published${typeof slug === 'string' && slug ? ` at /${code}/${slug}/` : ''}.`
      : status === 'draft'
        ? `${label}: draft — not on the site.`
        : `${label}: no translation yet. Nothing in this language is shown to readers.`

  return (
    <div className="bea-ready">
      <p className="bea-ready__heading">Translation</p>
      <p className="bea-ready__note">{statement}</p>
      {english?.status !== 'published' && english !== null && (
        <p className="bea-ready__note">
          The English article is not published, so this translation cannot go
          live yet.
        </p>
      )}
      {behind && (
        <p className="bea-ready__note">
          <strong>English has changed since this translation.</strong> English
          was last published {formatWhen(english?.modifiedAt)}; this was
          translated from the version of {formatWhen(translatedAt)}.
        </p>
      )}
      <p className="bea-ready__note">
        Publish here publishes {label} only. English and the other languages are
        left exactly as they are.
      </p>
    </div>
  )
}

export default TranslationPanel
