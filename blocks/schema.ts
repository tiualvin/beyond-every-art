// The insertable modules an editor can drop into a body, as Payload blocks.
//
// These are Lexical blocks, not a page-builder field: they serialize into the
// existing `content` rich-text column, so adding one changes no Postgres schema
// and needs no migration. See `docs/INSERTABLE_CONTENT_MODULES.md` for why that
// distinction decides how expensive a new module is.
//
// Slugs here are a public contract. They are stored inside every document that
// uses them and are read by the renderer, the plain-text serializer, and any
// future client. Rename one and you have written a data migration, however
// small the visual change looks — so they are named for what the module *is*,
// never for how it currently looks.

import type { Block } from 'payload'

export const ACCORDION_BLOCK = 'accordion'
export const PULL_QUOTE_BLOCK = 'pullQuote'
export const SIGNUP_BLOCK = 'signup'

/** Every block slug this repository knows how to render. */
export const BLOCK_SLUGS = [
  ACCORDION_BLOCK,
  PULL_QUOTE_BLOCK,
  SIGNUP_BLOCK,
] as const

export type BlockSlug = (typeof BLOCK_SLUGS)[number]

// --- Data shapes ---------------------------------------------------------
//
// What each block's `fields` object looks like once Payload has stored it.
// Every field is optional at the type level even where the schema marks it
// required: a draft is saved mid-edit, and Live Preview renders it. A renderer
// that assumes `required` means "present" crashes the editor's own preview.

export type AccordionItem = {
  id?: string | null
  title?: string | null
  content?: unknown
  defaultOpen?: boolean | null
}

export type AccordionData = {
  heading?: string | null
  items?: AccordionItem[] | null
}

export const PULL_QUOTE_VARIANTS = ['centered', 'bordered', 'large'] as const
export type PullQuoteVariant = (typeof PULL_QUOTE_VARIANTS)[number]

export type PullQuoteData = {
  quote?: string | null
  attribution?: string | null
  variant?: PullQuoteVariant | null
}

export type SignupData = {
  heading?: string | null
  body?: string | null
  submitLabel?: string | null
}

// --- Block configs -------------------------------------------------------

/**
 * A dropdown of collapsible panels.
 *
 * Panel bodies are `richText` on the *default* editor rather than the content
 * editor, which is what stops a dropdown containing another dropdown. Payload
 * would happily nest them; the renderer would recurse; and an editor would have
 * built something no reader can navigate. Blocks are excluded one level down
 * instead of a cycle check being written.
 */
export const AccordionBlock: Block = {
  slug: ACCORDION_BLOCK,
  interfaceName: 'AccordionBlock',
  labels: { singular: 'Dropdown', plural: 'Dropdowns' },
  fields: [
    {
      name: 'heading',
      type: 'text',
      admin: {
        description:
          'Optional heading above the panels. Leave empty for a bare list.',
      },
    },
    {
      name: 'items',
      type: 'array',
      minRows: 1,
      required: true,
      labels: { singular: 'Panel', plural: 'Panels' },
      admin: {
        description:
          'Never put essential sequential instructions in here — a reader who does not open the panel never sees them.',
      },
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'content', type: 'richText' },
        {
          name: 'defaultOpen',
          type: 'checkbox',
          defaultValue: false,
          admin: {
            description: 'Show this panel already expanded.',
          },
        },
      ],
    },
  ],
}

/** A quotation lifted out of the flow of the body. */
export const PullQuoteBlock: Block = {
  slug: PULL_QUOTE_BLOCK,
  interfaceName: 'PullQuoteBlock',
  labels: { singular: 'Pull quote', plural: 'Pull quotes' },
  fields: [
    { name: 'quote', type: 'textarea', required: true },
    {
      name: 'attribution',
      type: 'text',
      admin: { description: 'Who said it. Optional.' },
    },
    {
      name: 'variant',
      type: 'select',
      defaultValue: 'centered',
      options: [
        { label: 'Centered', value: 'centered' },
        { label: 'Bordered', value: 'bordered' },
        { label: 'Large', value: 'large' },
      ],
      admin: {
        description:
          'Presentation only. Each variant is a design token set, not free styling.',
      },
    },
  ],
}

/**
 * A newsletter signup placed inside the body.
 *
 * There is deliberately no campaign, provider list, or tracking-source field.
 * Those belong to the `signup-campaigns` collection this repository has not
 * built yet, and a hidden client-supplied source is exactly the value a server
 * must not trust — the renderer's action derives the source itself.
 */
export const SignupBlock: Block = {
  slug: SIGNUP_BLOCK,
  interfaceName: 'SignupBlock',
  labels: { singular: 'Newsletter signup', plural: 'Newsletter signups' },
  fields: [
    { name: 'heading', type: 'text', required: true },
    {
      name: 'body',
      type: 'textarea',
      admin: { description: 'One or two lines under the heading.' },
    },
    { name: 'submitLabel', type: 'text', defaultValue: 'Subscribe' },
  ],
}

/** The blocks offered inside a Post or Page body. */
export const CONTENT_BLOCKS: Block[] = [
  AccordionBlock,
  PullQuoteBlock,
  SignupBlock,
]
