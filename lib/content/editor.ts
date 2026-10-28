// The Lexical editor used for Post and Page bodies.
//
// Kept apart from the `editor` in `payload.config.ts`, which stays the stock
// editor and remains the default for every other rich-text field in the
// project. Only the two body fields get insertable modules: an app description
// or an accordion panel offering the full module picker would let an editor
// nest modules inside modules, which is a shape neither the renderer nor a
// reader has any use for.

import {
  BlocksFeature,
  lexicalEditor,
  UploadFeature,
} from '@payloadcms/richtext-lexical'
import type { Field } from 'payload'

import { CONTENT_BLOCKS } from '../../blocks/schema'

/**
 * What one placement of an image in a body can say for itself.
 *
 * Optional, and an override: left empty, the figure shows the Media record's
 * own caption and credit (`lib/content/body-image.ts`). A caption belongs to
 * a placement as often as to a picture — the same photograph of a pigment
 * cabinet illustrates a point about storage in one article and about trade in
 * another. A credit almost never does, which is why only the record's credit
 * is ever rendered as a link.
 *
 * Stored in the rich-text JSON like the rest of the node, so these change no
 * database schema.
 */
export const BODY_IMAGE_FIELDS: Field[] = [
  {
    name: 'caption',
    type: 'textarea',
    admin: {
      description:
        "Shown under the image here. Leave empty to use the image's own caption.",
    },
  },
  {
    name: 'credit',
    type: 'text',
    admin: {
      description:
        "Who made or supplied the image. Leave empty to use the image's own credit, which is the one that links to its source.",
    },
  },
]

/**
 * The stock feature set plus this project's insertable blocks, with the stock
 * upload feature swapped for one whose image nodes carry `BODY_IMAGE_FIELDS`.
 *
 * Adding blocks here changes no database schema — block values serialize into
 * the rich-text JSON the `content` column already holds.
 */
export const contentEditor = lexicalEditor({
  features: ({ defaultFeatures }) => [
    ...defaultFeatures.filter((feature) => feature.key !== 'upload'),
    UploadFeature({ collections: { media: { fields: BODY_IMAGE_FIELDS } } }),
    BlocksFeature({ blocks: CONTENT_BLOCKS }),
  ],
})
