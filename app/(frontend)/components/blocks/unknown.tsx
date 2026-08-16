import { logUnknownBlock } from '@/lib/observability/unknown-block'

/**
 * What a reader gets where an unrenderable node was.
 *
 * This is not a hypothetical: a block slug removed while published documents
 * still contain it, a document restored from a backup taken before a rename, or
 * a draft written against a newer deploy all land here.
 *
 * Published pages get nothing at all, plus a structured log line. Losing one
 * module is a far smaller failure than throwing and taking the article around
 * it down, and a reader can do nothing with an error either way. Preview is the
 * opposite: an editor is the only person who can fix this, so they have to see
 * that something is there and broken.
 */
export function UnknownNode({
  nodeType,
  blockType,
  preview,
}: {
  nodeType: string
  blockType: string | null
  preview: boolean
}) {
  logUnknownBlock({ nodeType, blockType })

  if (!preview) return null

  return (
    <div className="module module--unknown" role="note">
      <strong>Unrecognised module</strong>
      <span>
        {blockType
          ? `This document contains a “${blockType}” module that this version of the site cannot render.`
          : `This document contains a “${nodeType}” node that this version of the site cannot render.`}
      </span>
      <span>Readers see nothing here. Replace it or remove it.</span>
    </div>
  )
}
