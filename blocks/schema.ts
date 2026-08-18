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
export const CALLOUT_BLOCK = 'callout'
export const BUTTON_BLOCK = 'button'
export const GALLERY_BLOCK = 'gallery'
export const BOOKMARK_BLOCK = 'bookmark'
export const EMBED_BLOCK = 'embed'
export const PAYWALL_BLOCK = 'paywall'

/** Every block slug this repository knows how to render. */
export const BLOCK_SLUGS = [
  ACCORDION_BLOCK,
  PULL_QUOTE_BLOCK,
  SIGNUP_BLOCK,
  CALLOUT_BLOCK,
  BUTTON_BLOCK,
  GALLERY_BLOCK,
  BOOKMARK_BLOCK,
  EMBED_BLOCK,
  PAYWALL_BLOCK,
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

export const CALLOUT_TONES = ['accent', 'neutral', 'dark'] as const
export type CalloutTone = (typeof CALLOUT_TONES)[number]

export type CalloutData = {
  emoji?: string | null
  tone?: CalloutTone | null
  content?: unknown
}

export const BUTTON_VARIANTS = ['primary', 'secondary'] as const
export type ButtonVariant = (typeof BUTTON_VARIANTS)[number]

export const BUTTON_ALIGNMENTS = ['left', 'center'] as const
export type ButtonAlignment = (typeof BUTTON_ALIGNMENTS)[number]

export type ButtonData = {
  label?: string | null
  href?: string | null
  variant?: ButtonVariant | null
  align?: ButtonAlignment | null
}

export type GalleryItem = {
  id?: string | null
  image?: unknown
  caption?: string | null
}

export const GALLERY_LAYOUTS = ['grid', 'rows'] as const
export type GalleryLayout = (typeof GALLERY_LAYOUTS)[number]

export type GalleryData = {
  items?: GalleryItem[] | null
  layout?: GalleryLayout | null
  caption?: string | null
}

export type BookmarkData = {
  url?: string | null
  title?: string | null
  description?: string | null
  publisher?: string | null
  image?: unknown
}

export type EmbedData = {
  url?: string | null
  title?: string | null
}

export type PaywallData = {
  note?: string | null
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

/** An aside: a note, warning or digression set apart from the body. */
export const CalloutBlock: Block = {
  slug: CALLOUT_BLOCK,
  interfaceName: 'CalloutBlock',
  labels: { singular: 'Callout', plural: 'Callouts' },
  fields: [
    {
      name: 'emoji',
      type: 'text',
      maxLength: 8,
      admin: {
        description:
          'Optional single emoji. Decorative — it is hidden from screen readers, so never put meaning only here.',
      },
    },
    {
      name: 'tone',
      type: 'select',
      defaultValue: 'neutral',
      options: [
        { label: 'Neutral', value: 'neutral' },
        { label: 'Accent', value: 'accent' },
        { label: 'Dark', value: 'dark' },
      ],
    },
    { name: 'content', type: 'richText', required: true },
  ],
}

/**
 * A call to action.
 *
 * `href` takes a relative path or an absolute `https:` URL and nothing else.
 * The value lands in an anchor, and `javascript:` in an anchor is script
 * execution by whoever could write the document — the same reachable-by-the-
 * lowest-privileged-role problem that `legacyHTML` had.
 */
export const ButtonBlock: Block = {
  slug: BUTTON_BLOCK,
  interfaceName: 'ButtonBlock',
  labels: { singular: 'Button', plural: 'Buttons' },
  fields: [
    { name: 'label', type: 'text', required: true },
    {
      name: 'href',
      type: 'text',
      required: true,
      admin: {
        description: 'A path such as /journal, or a full https:// URL.',
      },
      validate: (value: string | null | undefined) => {
        const raw = (value ?? '').trim()
        if (!raw) return 'Enter a path or an https:// URL.'
        if (raw.startsWith('/')) return true
        try {
          if (new URL(raw).protocol === 'https:') return true
        } catch {
          return 'That is not a valid path or URL.'
        }
        return 'Links must be a relative path or use https://.'
      },
    },
    {
      name: 'variant',
      type: 'select',
      defaultValue: 'primary',
      options: [
        { label: 'Primary', value: 'primary' },
        { label: 'Secondary', value: 'secondary' },
      ],
    },
    {
      name: 'align',
      type: 'select',
      defaultValue: 'left',
      options: [
        { label: 'Left', value: 'left' },
        { label: 'Centered', value: 'center' },
      ],
    },
  ],
}

/**
 * A set of images shown together.
 *
 * A grid rather than a carousel, deliberately. A carousel hides most of what it
 * holds behind an interaction, which for a publication about looking at works
 * is the wrong default — and the accessibility bill (announced position,
 * keyboard paging, reduced motion, a no-JavaScript fallback) is paid for
 * hiding things the reader wanted to see. A grid needs none of it.
 */
export const GalleryBlock: Block = {
  slug: GALLERY_BLOCK,
  interfaceName: 'GalleryBlock',
  labels: { singular: 'Gallery', plural: 'Galleries' },
  fields: [
    {
      name: 'items',
      type: 'array',
      minRows: 1,
      maxRows: 12,
      required: true,
      labels: { singular: 'Image', plural: 'Images' },
      fields: [
        { name: 'image', type: 'upload', relationTo: 'media', required: true },
        { name: 'caption', type: 'text' },
      ],
    },
    {
      name: 'layout',
      type: 'select',
      defaultValue: 'grid',
      options: [
        { label: 'Grid', value: 'grid' },
        { label: 'Rows', value: 'rows' },
      ],
    },
    {
      name: 'caption',
      type: 'text',
      admin: { description: 'Optional caption for the gallery as a whole.' },
    },
  ],
}

/**
 * A rich link to something off-site.
 *
 * Ghost fetches this metadata from the URL when an editor pastes it. This one
 * does not, for two concrete reasons rather than as a simplification. Fetching
 * an editor-supplied URL server-side is request forgery surface that has to be
 * defended with an allowlist and address checks; and the thumbnail would be a
 * remote image, which `img-src` in `lib/security/csp.ts` does not permit — it
 * allows this origin, R2 and the analytics hosts, so a hotlinked preview would
 * be blocked in the browser anyway. The picture is a Media upload instead.
 */
export const BookmarkBlock: Block = {
  slug: BOOKMARK_BLOCK,
  interfaceName: 'BookmarkBlock',
  labels: { singular: 'Bookmark', plural: 'Bookmarks' },
  fields: [
    {
      name: 'url',
      label: 'URL',
      type: 'text',
      required: true,
      validate: (value: string | null | undefined) => {
        const raw = (value ?? '').trim()
        if (!raw) return 'Enter the URL this bookmark points at.'
        try {
          return new URL(raw).protocol === 'https:'
            ? true
            : 'Bookmarks must use https://.'
        } catch {
          return 'That is not a valid URL.'
        }
      },
    },
    { name: 'title', type: 'text', required: true },
    { name: 'description', type: 'textarea' },
    {
      name: 'publisher',
      type: 'text',
      admin: { description: 'The site being linked to, e.g. The Burlington.' },
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description:
          'Optional thumbnail. Upload it — remote images are blocked by the content security policy.',
      },
    },
  ],
}

/**
 * A provider embed, built here from a URL.
 *
 * Never pasted provider HTML: that is arbitrary third-party markup and script
 * in a document, which is the thing `docs/INSERTABLE_CONTENT_MODULES.md` rules
 * out. The editor gives a watch URL, this repository decides what iframe to
 * build, and `lib/content/embed.ts` holds the provider allowlist. Anything off
 * the list renders as a plain link rather than an empty box.
 */
export const EmbedBlock: Block = {
  slug: EMBED_BLOCK,
  interfaceName: 'EmbedBlock',
  labels: { singular: 'Embed', plural: 'Embeds' },
  fields: [
    {
      name: 'url',
      label: 'URL',
      type: 'text',
      required: true,
      admin: {
        description:
          'A YouTube or Vimeo URL. Other providers render as a link until they are added to the allowlist.',
      },
      validate: (value: string | null | undefined) => {
        const raw = (value ?? '').trim()
        if (!raw) return 'Enter the URL of the video.'
        try {
          return new URL(raw).protocol === 'https:'
            ? true
            : 'Embeds must use https://.'
        } catch {
          return 'That is not a valid URL.'
        }
      },
    },
    {
      name: 'title',
      type: 'text',
      required: true,
      admin: {
        description:
          'Names the frame for screen readers, and labels the fallback link. Required.',
      },
    },
  ],
}

/**
 * Where a gated post stops for a reader who is not a member.
 *
 * Without this the teaser is the first ~500 characters, which lands wherever it
 * lands. The cut is enforced server-side in `lib/content/body.ts`: everything
 * after this marker is dropped before the page is built, never hidden in the
 * markup.
 *
 * It has no effect on a public post, and it is not a visible element — on a
 * published page it renders nothing at all.
 */
export const PaywallBlock: Block = {
  slug: PAYWALL_BLOCK,
  interfaceName: 'PaywallBlock',
  labels: { singular: 'Members-only cut', plural: 'Members-only cuts' },
  fields: [
    {
      name: 'note',
      type: 'text',
      admin: {
        description:
          'Optional note to other editors. Never shown to a reader. Only has an effect when the post’s visibility is members or paid.',
      },
    },
  ],
}

/** The blocks offered inside a Post or Page body. */
export const CONTENT_BLOCKS: Block[] = [
  AccordionBlock,
  PullQuoteBlock,
  SignupBlock,
  CalloutBlock,
  ButtonBlock,
  GalleryBlock,
  BookmarkBlock,
  EmbedBlock,
  PaywallBlock,
]
