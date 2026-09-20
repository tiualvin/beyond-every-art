// What breaks if this image goes.
//
// `collections/Media.ts` already says the dangerous part out loud: deleting an
// upload removes the file every post referencing it renders, "and unlike a
// post, nothing about the admin list makes that visible before the click." Soft
// delete answered the recovery half of that — the record can come back — and
// left the knowing half exactly where it was. An editor tidying the library
// still cannot tell a stray test upload from the lead image of the
// best-performing article on the site, because both are a filename and a
// thumbnail.
//
// This is the knowing half: the documents that point at this upload, listed by
// name, before anyone clicks anything.
//
// A server component, so the count is a query rather than something the browser
// asks for after the page has painted. It runs with the signed-in user's
// access, like the dashboard, and it never throws: a panel that fails takes the
// edit view with it, and this is decoration on a screen whose real job is
// changing alt text.

import type { Payload, TypedUser } from 'payload'
import React from 'react'

type Props = {
  payload: Payload
  user?: TypedUser | null
  data?: { id?: string | number } | null
}

type Ref = { id: string | number; title: string; collection: string }

const LIMIT = 12

async function referencing(
  payload: Payload,
  collection: 'posts' | 'pages',
  field: string,
  id: string | number,
  user?: TypedUser | null,
): Promise<{ rows: Ref[]; total: number }> {
  try {
    const result = await payload.find({
      collection,
      where: { [field]: { equals: id } },
      depth: 0,
      limit: LIMIT,
      overrideAccess: false,
      user: user ?? undefined,
    })
    return {
      rows: (result.docs as Array<{ id?: string | number; title?: string }>)
        .filter((doc) => doc.id !== undefined)
        .map((doc) => ({
          id: doc.id!,
          title: doc.title?.trim() || `Untitled ${collection.slice(0, -1)}`,
          collection,
        })),
      total: result.totalDocs ?? 0,
    }
  } catch {
    return { rows: [], total: 0 }
  }
}

export async function MediaUsage({ payload, user, data }: Props) {
  const id = data?.id
  if (id === undefined || id === null || id === '') return null

  const [posts, pages] = await Promise.all([
    referencing(payload, 'posts', 'featuredImage', id, user),
    referencing(payload, 'pages', 'featuredImage', id, user),
  ])

  const total = posts.total + pages.total
  const rows = [...posts.rows, ...pages.rows]

  return (
    <div className="bea-usage">
      <p className="bea-usage__heading">
        {total === 0
          ? 'Not used as a cover on anything.'
          : `Cover image on ${total} ${total === 1 ? 'document' : 'documents'}.`}
      </p>

      {rows.length > 0 && (
        <ul className="bea-usage__list">
          {rows.map((ref) => (
            <li key={`${ref.collection}-${ref.id}`}>
              <a href={`/admin/collections/${ref.collection}/${ref.id}`}>
                {ref.title}
              </a>
            </li>
          ))}
          {total > rows.length && (
            <li className="bea-usage__more">and {total - rows.length} more</li>
          )}
        </ul>
      )}

      <p className="bea-usage__note">
        {/*
          Stated rather than implied, because the honest answer is narrower than
          the question an editor is really asking. A cover is a relationship
          Payload can query; an image dropped into a body is a node inside the
          rich-text JSON, and finding those means reading every document rather
          than an indexed column.
        */}
        Covers only. An image placed inside an article body is stored in the
        body itself, so it is not counted here — deleting this may still blank a
        picture inside a piece.
      </p>
    </div>
  )
}

export default MediaUsage
