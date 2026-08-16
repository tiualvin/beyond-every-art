import {
  ACCORDION_BLOCK,
  BOOKMARK_BLOCK,
  BUTTON_BLOCK,
  CALLOUT_BLOCK,
  EMBED_BLOCK,
  GALLERY_BLOCK,
  PULL_QUOTE_BLOCK,
} from '../../blocks/schema'

export const GHOST_CARD_COVERAGE: Readonly<Record<string, string | null>> = {
  'kg-bookmark-card': BOOKMARK_BLOCK,
  'kg-callout-card': CALLOUT_BLOCK,
  'kg-toggle-card': ACCORDION_BLOCK,
  'kg-button-card': BUTTON_BLOCK,
  'kg-gallery-card': GALLERY_BLOCK,
  'kg-embed-card': EMBED_BLOCK,
  'kg-blockquote-card': PULL_QUOTE_BLOCK,
  'kg-image-card': 'built-in (upload node)',
  'kg-code-card': 'built-in (code node)',
  'kg-audio-card': null,
  'kg-video-card': null,
  'kg-file-card': null,
  'kg-product-card': null,
  'kg-header-card': null,
  'kg-nft-card': null,
}

type GhostDocument = { slug?: string; title?: string; html?: string | null }

export type CardInventoryRow = {
  card: string
  uses: number
  documents: number
  exampleSlug: string
  coverage: string | null
  status: 'covered' | 'unhandled' | 'unknown'
}

export type CardInventory = {
  documents: number
  documentsWithCards: number
  rawHTMLCards: number
  cards: CardInventoryRow[]
  unhandledCards: number
  unknownCards: number
  ok: boolean
}

const CARD_CLASS = /kg-[a-z0-9-]*-card(?![-\w])/g
const HTML_CARD = /<!--kg-card-begin:\s*html-->/g

function collectDocuments(payload: unknown): GhostDocument[] {
  if (!payload || typeof payload !== 'object') return []

  const root = payload as {
    db?: Array<{ data?: Record<string, unknown> }>
    data?: Record<string, unknown>
  }
  const data =
    root.db?.[0]?.data ?? root.data ?? (payload as Record<string, unknown>)
  const documents: GhostDocument[] = []

  for (const key of ['posts', 'pages']) {
    const rows = data[key]
    if (Array.isArray(rows)) documents.push(...(rows as GhostDocument[]))
  }

  return documents
}

export function inventoryGhostCards(payload: unknown): CardInventory {
  const documents = collectDocuments(payload)
  if (documents.length === 0) {
    throw new Error('Ghost export held no posts or pages')
  }

  const totals = new Map<string, number>()
  const documentsByCard = new Map<string, Set<string>>()
  const examples = new Map<string, string>()
  let rawHTMLCards = 0
  let documentsWithCards = 0

  for (const document of documents) {
    const html = typeof document.html === 'string' ? document.html : ''
    const cards = html.match(CARD_CLASS) ?? []
    rawHTMLCards += (html.match(HTML_CARD) ?? []).length
    if (cards.length > 0) documentsWithCards += 1

    const identity = document.slug ?? document.title ?? '(untitled)'
    for (const card of cards) {
      totals.set(card, (totals.get(card) ?? 0) + 1)
      const seen = documentsByCard.get(card) ?? new Set<string>()
      seen.add(identity)
      documentsByCard.set(card, seen)
      if (!examples.has(card)) examples.set(card, document.slug ?? '(untitled)')
    }
  }

  const cards = [...totals.entries()]
    .sort(
      ([cardA, usesA], [cardB, usesB]) =>
        usesB - usesA || cardA.localeCompare(cardB),
    )
    .map(([card, uses]): CardInventoryRow => {
      const known = Object.hasOwn(GHOST_CARD_COVERAGE, card)
      const coverage = known ? GHOST_CARD_COVERAGE[card] : null
      return {
        card,
        uses,
        documents: documentsByCard.get(card)?.size ?? 0,
        exampleSlug: examples.get(card) ?? '(untitled)',
        coverage,
        status: !known
          ? 'unknown'
          : coverage === null
            ? 'unhandled'
            : 'covered',
      }
    })

  const unhandledCards = cards.filter(
    (row) => row.status === 'unhandled',
  ).length
  const unknownCards = cards.filter((row) => row.status === 'unknown').length

  return {
    documents: documents.length,
    documentsWithCards,
    rawHTMLCards,
    cards,
    unhandledCards,
    unknownCards,
    ok: unhandledCards === 0 && unknownCards === 0,
  }
}
