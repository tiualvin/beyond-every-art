// The Lexical editor used for Post and Page bodies.
//
// Kept apart from the `editor` in `payload.config.ts`, which stays the stock
// editor and remains the default for every other rich-text field in the
// project. Only the two body fields get insertable modules: an app description
// or an accordion panel offering the full module picker would let an editor
// nest modules inside modules, which is a shape neither the renderer nor a
// reader has any use for.

import { BlocksFeature, lexicalEditor } from '@payloadcms/richtext-lexical'

import { CONTENT_BLOCKS } from '../../blocks/schema'

/**
 * The stock feature set plus this project's insertable blocks.
 *
 * Adding blocks here changes no database schema — block values serialize into
 * the rich-text JSON the `content` column already holds.
 */
export const contentEditor = lexicalEditor({
  features: ({ defaultFeatures }) => [
    ...defaultFeatures,
    BlocksFeature({ blocks: CONTENT_BLOCKS }),
  ],
})
