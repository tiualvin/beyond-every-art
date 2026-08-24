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

import type { Block, Field } from 'payload'

import type { LinkRelationship } from '../lib/content/link-rel'

export const ACCORDION_BLOCK = 'accordion'
export const PULL_QUOTE_BLOCK = 'pullQuote'
export const SIGNUP_BLOCK = 'signup'
export const CALLOUT_BLOCK = 'callout'
export const BUTTON_BLOCK = 'button'
export const GALLERY_BLOCK = 'gallery'
export const BOOKMARK_BLOCK = 'bookmark'
export const EMBED_BLOCK = 'embed'
export const PAYWALL_BLOCK = 'paywall'
export const KEY_TAKEAWAYS_BLOCK = 'keyTakeaways'
export const FAQ_BLOCK = 'faq'
export const FEATURE_LIST_BLOCK = 'featureList'
export const MEDIA_TEXT_BLOCK = 'mediaText'
export const COMPARISON_TABLE_BLOCK = 'comparisonTable'

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
  KEY_TAKEAWAYS_BLOCK,
  FAQ_BLOCK,
  FEATURE_LIST_BLOCK,
  MEDIA_TEXT_BLOCK,
  COMPARISON_TABLE_BLOCK,
] as const

export type BlockSlug = (typeof BLOCK_SLUGS)[number]

/**
 * The "what kind of link is this" select, shared by every block with an href.
 *
 * Written once so the button and the bookmark cannot drift apart on what the
 * options mean. `lib/content/link-rel.ts` turns the stored value into the
 * attribute; see the note there for why a publication that runs campaign pages
 * needs this at all.
 */
function linkRelationshipField(): Field {
  return {
    name: 'relationship',
    type: 'select',
    defaultValue: 'normal',
    // Annotated so a typo in a value is a compile error rather than an option
    // that silently falls back to `normal` at render time.
    options: [
      { label: 'Ordinary link', value: 'normal' },
      { label: 'Paid or affiliate (sponsored)', value: 'sponsored' },
      { label: 'Not endorsed (nofollow)', value: 'nofollow' },
      { label: 'Reader-submitted (ugc)', value: 'ugc' },
    ] satisfies Array<{ label: string; value: LinkRelationship }>,
    admin: {
      description:
        'Anything paid for — an affiliate link, an advertiser, a sponsored placement — must be marked sponsored. Search engines treat an unmarked paid link as an attempt to pass ranking on.',
    },
  }
}

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
  sourceURL?: string | null
  variant?: PullQuoteVariant | null
}

/**
 * A campaign as the signup module needs to see it once Payload has populated
 * the relationship. Left as an id when a query ran too shallow to populate it.
 */
export type SignupCampaign = {
  id?: number | string
  slug?: string | null
  heading?: string | null
  body?: string | null
  submitLabel?: string | null
  consentText?: string | null
  privacyLink?: string | null
  successMessage?: string | null
  active?: boolean | null
  startsAt?: string | null
  endsAt?: string | null
}

export type SignupData = {
  campaign?: SignupCampaign | number | string | null
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
  relationship?: string | null
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
  relationship?: string | null
  image?: unknown
}

export type EmbedData = {
  url?: string | null
  title?: string | null
}

export type PaywallData = {
  note?: string | null
}

export type KeyTakeawayItem = {
  id?: string | null
  text?: string | null
}

export type KeyTakeawaysData = {
  heading?: string | null
  items?: KeyTakeawayItem[] | null
}

export type FaqItem = {
  id?: string | null
  question?: string | null
  answer?: unknown
}

export type FaqData = {
  heading?: string | null
  items?: FaqItem[] | null
}

export type FeatureListItem = {
  id?: string | null
  title?: string | null
  body?: string | null
  image?: unknown
}

export const FEATURE_LIST_VARIANTS = ['list', 'steps'] as const
export type FeatureListVariant = (typeof FEATURE_LIST_VARIANTS)[number]

export type FeatureListData = {
  heading?: string | null
  intro?: string | null
  variant?: FeatureListVariant | null
  numbered?: boolean | null
  items?: FeatureListItem[] | null
}

export const MEDIA_SIDES = ['left', 'right'] as const
export type MediaSide = (typeof MEDIA_SIDES)[number]

export type MediaTextData = {
  image?: unknown
  heading?: string | null
  body?: unknown
  imageSide?: MediaSide | null
}

export type ComparisonColumn = {
  id?: string | null
  label?: string | null
}

export type ComparisonCell = {
  id?: string | null
  value?: string | null
}

export type ComparisonRow = {
  id?: string | null
  label?: string | null
  cells?: ComparisonCell[] | null
}

export type ComparisonTableData = {
  caption?: string | null
  rowHeader?: string | null
  columns?: ComparisonColumn[] | null
  rows?: ComparisonRow[] | null
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
      name: 'sourceURL',
      label: 'Source URL',
      type: 'text',
      admin: {
        description:
          'Where the quotation came from. Names the source in the markup and links the attribution.',
      },
      validate: (value: string | null | undefined) => {
        const raw = (value ?? '').trim()
        // Optional, unlike the button's href — a quotation from a book or an
        // interview has no URL, and demanding one would push editors into
        // inventing a page that happens to mention it.
        if (!raw) return true
        try {
          return new URL(raw).protocol === 'https:'
            ? true
            : 'Source links must use https://.'
        } catch {
          return 'That is not a valid URL.'
        }
      },
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
 * There is still no provider list or tracking-source field, and there will not
 * be one: a hidden client-supplied source is exactly the value a server must
 * not trust. What the block may name is a *campaign*, and the server reads the
 * attribution out of that record rather than out of the form — see
 * `collections/SignupCampaigns.ts`.
 *
 * The local copy stays required rather than becoming conditional on the
 * campaign. A campaign can be switched off or run past its end date, and when
 * it does every module pointing at it needs something to say.
 */
export const SignupBlock: Block = {
  slug: SIGNUP_BLOCK,
  interfaceName: 'SignupBlock',
  labels: { singular: 'Newsletter signup', plural: 'Newsletter signups' },
  fields: [
    {
      name: 'campaign',
      type: 'relationship',
      relationTo: 'signup-campaigns',
      admin: {
        description:
          'Optional. Points this module at a campaign, whose copy replaces the fields below and whose name is what the signup is attributed to. Ending the campaign ends every module pointing at it.',
      },
    },
    {
      name: 'heading',
      type: 'text',
      required: true,
      admin: {
        description:
          'Used when there is no campaign, or when the campaign is not currently running.',
      },
    },
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
    linkRelationshipField(),
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
    linkRelationshipField(),
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

/**
 * The points a reader should leave with, as a short list.
 *
 * Deliberately not a callout. A callout is an `<aside>` — content set apart
 * from the argument — and a summary of the argument is the opposite of that.
 * It is a `<section>` with a heading and an ordered list, which is the shape
 * search engines lift into a list result and the shape an answer engine can
 * quote without having to decide what the article was about.
 */
export const KeyTakeawaysBlock: Block = {
  slug: KEY_TAKEAWAYS_BLOCK,
  interfaceName: 'KeyTakeawaysBlock',
  labels: { singular: 'Key takeaways', plural: 'Key takeaways' },
  fields: [
    {
      name: 'heading',
      type: 'text',
      defaultValue: 'Key takeaways',
      admin: {
        description:
          'Names the section. Leave the default unless it reads oddly.',
      },
    },
    {
      name: 'items',
      type: 'array',
      minRows: 1,
      maxRows: 8,
      required: true,
      labels: { singular: 'Takeaway', plural: 'Takeaways' },
      admin: {
        description:
          'One sentence each, and each one true on its own — a reader who reads only this list should not be misled by it.',
      },
      fields: [{ name: 'text', type: 'textarea', required: true }],
    },
  ],
}

/**
 * Questions and their answers.
 *
 * A separate block from the dropdown even though both collapse, because the
 * difference is not presentational: a dropdown is a way of showing something,
 * an FAQ is a claim about what the content *is*. Only the second can be
 * described to a search engine as questions and answers, and guessing which
 * dropdowns happened to be Q&A would mean describing "Materials used" as a
 * question somebody asked.
 *
 * Each question is a heading with its own anchor, so an answer can be linked
 * to directly rather than only the article that contains it.
 */
export const FaqBlock: Block = {
  slug: FAQ_BLOCK,
  interfaceName: 'FaqBlock',
  labels: { singular: 'FAQ', plural: 'FAQs' },
  fields: [
    {
      name: 'heading',
      type: 'text',
      defaultValue: 'Frequently asked questions',
    },
    {
      name: 'items',
      type: 'array',
      minRows: 1,
      required: true,
      labels: { singular: 'Question', plural: 'Questions' },
      admin: {
        description:
          'Write the question the way a reader would ask it, not the way a heading would phrase it.',
      },
      fields: [
        { name: 'question', type: 'text', required: true },
        { name: 'answer', type: 'richText', required: true },
      ],
    },
  ],
}

/**
 * A list of things, each with a title and its own paragraph.
 *
 * The editorial "six pigments that changed painting" shape, and the same shape
 * a landing page uses for what something offers. Each item's title is a real
 * heading with an anchor, which is where the search value is: a flat list of
 * bolded phrases contributes nothing to a document outline, and the same list
 * as headings gives every item its own addressable section.
 *
 * Images are optional per item rather than all-or-nothing, because a list of
 * six where two have a plate is a normal article and a placeholder for the
 * other four would be worse than the asymmetry.
 */
export const FeatureListBlock: Block = {
  slug: FEATURE_LIST_BLOCK,
  interfaceName: 'FeatureListBlock',
  labels: { singular: 'Feature list', plural: 'Feature lists' },
  fields: [
    { name: 'heading', type: 'text' },
    {
      name: 'intro',
      type: 'textarea',
      admin: { description: 'Optional line under the heading.' },
    },
    {
      name: 'variant',
      type: 'select',
      defaultValue: 'list',
      options: [
        { label: 'List of things', value: 'list' },
        { label: 'Steps in a process', value: 'steps' },
      ],
      admin: {
        description:
          'Steps are always numbered and shown as a sequence. Use it only when doing them out of order would be wrong.',
      },
    },
    {
      name: 'numbered',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description:
          'Numbers the items. Turn this off when the order carries no meaning — a numbered list tells a reader the sequence matters. Ignored for steps, which are numbered by definition.',
        condition: (_data, siblingData: Partial<FeatureListData>) =>
          siblingData?.variant !== 'steps',
      },
    },
    {
      name: 'items',
      type: 'array',
      minRows: 1,
      maxRows: 20,
      required: true,
      labels: { singular: 'Item', plural: 'Items' },
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'body', type: 'textarea' },
        { name: 'image', type: 'upload', relationTo: 'media' },
      ],
    },
  ],
}

/**
 * An image beside a passage of text.
 *
 * The alternating row a landing page is built from, and a perfectly ordinary
 * editorial figure-with-commentary. It exists as its own block rather than
 * being achieved with a floated image because the two halves need to stack in
 * a defined order on a phone — and because a float leaves the text and the
 * picture with no stated relationship for anyone not looking at the layout.
 *
 * `imageSide` is presentation only. The markup order is always image then
 * text, so the reading order a screen reader and a crawler get does not change
 * when a designer alternates the rows.
 */
export const MediaTextBlock: Block = {
  slug: MEDIA_TEXT_BLOCK,
  interfaceName: 'MediaTextBlock',
  labels: { singular: 'Image and text', plural: 'Image and text' },
  fields: [
    { name: 'image', type: 'upload', relationTo: 'media', required: true },
    { name: 'heading', type: 'text' },
    { name: 'body', type: 'richText', required: true },
    {
      name: 'imageSide',
      type: 'select',
      defaultValue: 'left',
      options: [
        { label: 'Image on the left', value: 'left' },
        { label: 'Image on the right', value: 'right' },
      ],
      admin: {
        description:
          'Which side the image sits on for a wide screen. Both stack image-first on a phone.',
      },
    },
  ],
}

/**
 * A small table of values compared across columns.
 *
 * Pigment against binder, one material against another — the shape this
 * publication keeps needing and the shape a general rich-text table serves
 * badly. Owning the markup is the point: a real `<caption>`, `scope="col"` on
 * the column heads and `scope="row"` on the first cell of each row are what
 * make a table readable out loud and liftable into a search result, and none
 * of them survive an editor building a grid by hand.
 *
 * Deliberately capped small. A table with fifteen columns is a spreadsheet,
 * and no phone renders one usefully.
 */
export const ComparisonTableBlock: Block = {
  slug: COMPARISON_TABLE_BLOCK,
  interfaceName: 'ComparisonTableBlock',
  labels: { singular: 'Comparison table', plural: 'Comparison tables' },
  fields: [
    {
      name: 'caption',
      type: 'text',
      required: true,
      admin: {
        description:
          'What the table shows, as a sentence. Read out before the table itself, and often the only description a search result gets.',
      },
    },
    {
      name: 'rowHeader',
      type: 'text',
      admin: {
        description:
          'Optional label for the first column, the one naming each row — e.g. Pigment.',
      },
    },
    {
      name: 'columns',
      type: 'array',
      minRows: 1,
      maxRows: 5,
      required: true,
      labels: { singular: 'Column', plural: 'Columns' },
      fields: [{ name: 'label', type: 'text', required: true }],
    },
    {
      name: 'rows',
      type: 'array',
      minRows: 1,
      maxRows: 30,
      required: true,
      labels: { singular: 'Row', plural: 'Rows' },
      fields: [
        {
          name: 'label',
          type: 'text',
          required: true,
          admin: { description: 'Names the row. Becomes its row header.' },
        },
        {
          name: 'cells',
          type: 'array',
          labels: { singular: 'Cell', plural: 'Cells' },
          admin: {
            description:
              'One per column, in order. A row with too few is padded with blanks rather than rejected.',
          },
          fields: [{ name: 'value', type: 'text' }],
        },
      ],
    },
  ],
}

/** The blocks offered inside a Post or Page body. */
export const CONTENT_BLOCKS: Block[] = [
  KeyTakeawaysBlock,
  FaqBlock,
  FeatureListBlock,
  MediaTextBlock,
  ComparisonTableBlock,
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
