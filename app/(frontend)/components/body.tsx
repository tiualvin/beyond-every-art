import { RichText } from '@payloadcms/richtext-lexical/react'

import type { ArticleBody as ArticleBodyValue } from '@/lib/content/body'

import { buildConverters } from './blocks/registry'

/**
 * A document body, rendered whichever way it is stored.
 *
 * The two branches are not interchangeable and the split is the point of this
 * component. Rich text becomes typed React nodes, so an insertable module is a
 * real component with behavior. Preserved Ghost markup keeps going through
 * `dangerouslySetInnerHTML` exactly as it always has — that path is unchanged,
 * still the reason `lib/security/csp.ts` exists, and never sees a block.
 */
export function ArticleBody({
  body,
  className = 'prose',
  preview = false,
  emptyMessage,
}: {
  body: ArticleBodyValue
  className?: string
  preview?: boolean
  emptyMessage?: string
}) {
  if (body.kind === 'empty') {
    return emptyMessage ? <p className="muted">{emptyMessage}</p> : null
  }

  if (body.kind === 'html') {
    return (
      <div
        className={className}
        dangerouslySetInnerHTML={{ __html: body.html }}
      />
    )
  }

  return (
    <div className={className}>
      <RichText
        data={body.content as never}
        converters={buildConverters(preview)}
        disableContainer
      />
    </div>
  )
}
