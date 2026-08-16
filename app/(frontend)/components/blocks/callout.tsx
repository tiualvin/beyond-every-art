import { RichText } from '@payloadcms/richtext-lexical/react'

import type { CalloutData, CalloutTone } from '@/blocks/schema'
import { CALLOUT_TONES } from '@/blocks/schema'
import { isEmptyRichText } from '@/lib/content/richtext'

const DEFAULT_TONE: CalloutTone = 'neutral'

function toTone(value: CalloutData['tone']): CalloutTone {
  return CALLOUT_TONES.includes(value as CalloutTone)
    ? (value as CalloutTone)
    : DEFAULT_TONE
}

/**
 * An aside set apart from the body.
 *
 * The emoji is `aria-hidden`: a screen reader announcing "sparkles" before the
 * text adds nothing a reader can use, and some emoji have announced names that
 * actively mislead. It is decoration, so it is marked as decoration — which is
 * also why the field description tells editors never to put meaning only there.
 */
export function Callout({ data }: { data: CalloutData }) {
  if (isEmptyRichText(data.content)) return null

  const emoji = data.emoji?.trim()

  return (
    <aside
      className={`module module--callout callout callout--${toTone(data.tone)}`}
    >
      {emoji && (
        <span className="callout__emoji" aria-hidden="true">
          {emoji}
        </span>
      )}
      <div className="callout__body">
        <RichText
          data={data.content as never}
          disableContainer
          disableTextAlign
        />
      </div>
    </aside>
  )
}
