// The site's own words, in English.
//
// Every string here is the one the site rendered before translations existed,
// character for character, so English pages come out byte-identical. Some
// entries are pairs rather than one sentence (`allPiecesBy`, `nothingMatches`)
// because the markup they replace was two text nodes around a value — React
// renders those differently from one string, and the difference would show up
// in every English page.
//
// The other languages are typed against this one, so a string added here is a
// compile error until each of them has it.

import { FREE_BENEFITS, PAID_BENEFITS } from '../../membership-copy'

export const en = {
  /** What this language is called in itself — the switcher's label for it. */
  languageName: 'English',
  switcher: { label: 'Language' },
  nav: {
    home: 'Home',
    search: 'Search',
    feed: 'RSS feed',
    subscribe: 'Subscribe',
    primary: 'Primary',
    footer: 'Footer',
  },
  common: {
    minutes: (n: number) => `${n} min`,
    minRead: (n: number) => `${n} min read`,
    members: 'Members',
    subscribers: 'Subscribers',
    journal: 'Journal',
  },
  chrome: {
    openSearch: 'Open search',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
    searchArchive: 'Search the archive',
    closeSearch: 'Close search',
    typeToSearch: 'Type to search',
    searching: 'Searching…',
    results: (n: number) => `${n} ${n === 1 ? 'result' : 'results'}`,
    toClose: ' to close',
    nothingMatches: ['Nothing matches ', ' yet.'] as [string, string],
    close: 'Close',
  },
  subscribe: {
    onTheList: 'You’re on the list',
    onTheListBody:
      'New stories on materials, technique, and meaning — delivered when they’re ready.',
    done: 'Done',
    title: 'Stay close to the work',
    lede: 'Read the journal, or back it — and open the pieces written for members.',
    chooseMembership: 'Choose a membership',
    free: 'Free',
    fullAccess: 'Full access',
    member: 'Member',
    perMonth: '/mo',
    perYear: '/yr',
    billingPeriod: 'Billing period',
    monthly: 'Monthly',
    aMonth: (price: number) => `$${price} a month`,
    yearly: 'Yearly',
    save: (amount: number) => `Save $${amount}`,
    continueToPayment: 'Continue to payment',
    paidNotOpen:
      'Paid membership isn’t open here yet. Choose Free above and we’ll write to you when it is.',
    emailPlaceholder: 'you@example.com',
    emailAddress: 'Email address',
    invalidEmail: 'That address doesn’t look right — check it and try again.',
    serverError:
      'Something went wrong on our end. Please try again in a moment.',
    subscribing: 'Subscribing…',
    subscribe: 'Subscribe',
    freeSmall: 'Free. Unsubscribe from any email, any time.',
    // The same lists the membership module has always exported, by
    // reference, so the English modal cannot drift from them.
    freeBenefits: FREE_BENEFITS,
    paidBenefits: PAID_BENEFITS,
  },
  newsletter: {
    title: 'Stay close to the work',
    body: 'New stories on materials, technique, and meaning — delivered when they’re ready.',
  },
  article: {
    emptyBody: 'This story has no body content yet.',
    allPiecesBy: ['All pieces by ', ' →'] as [string, string],
    inThisPiece: 'In this piece',
    railLabel: 'More from Beyond Every Art',
  },
  share: {
    copyLink: 'Copy link',
    email: 'Email',
    share: 'Share',
    copied: 'Link copied',
    pressToCopy: 'Press ⌘C to copy',
  },
  gate: {
    membersOnly: 'Members only',
    subscribersOnly: 'Subscribers only',
    restIsFor: 'The rest of this piece is for ',
    members: 'members',
    subscribers: 'subscribers',
    body: 'Memberships are not open yet — the site is moving to a new home first. Join the list and you will hear the moment they are, and get every public piece in the meantime.',
    join: 'Join the list',
    small: 'No account to make, nothing to pay.',
  },
  rail: {
    newsletter: 'The newsletter',
    title: 'Stay close to the work',
    copy: 'One piece a week on colour, material, and practice.',
    join: 'Join the list',
  },
  promos: {
    fromSite: 'From Beyond Every Art',
    worthReading: 'Worth reading',
    moreFromJournal: 'More from the journal',
    alsoFrom: 'Also from Beyond Every Art',
  },
  readNext: {
    eyebrow: 'Read next',
    moreOn: (topic: string) => `More on ${topic}`,
    moreFromJournal: 'More from the journal',
  },
  blocks: {
    faqHeading: 'Frequently asked questions',
    comparisonTable: 'Comparison table',
    keyTakeaways: 'Key takeaways',
  },
  footer: {
    rights: (year: number, site: string) =>
      `© ${year} ${site}. All rights reserved.`,
  },
  notFound: {
    eyebrow: 'Error 404',
    title: 'This page has wandered off the canvas.',
    body: 'The page you are looking for may have moved or never existed.',
    back: 'Back to home',
  },
  // Below: pages that exist only in translated languages. English has its
  // own, richer templates for all of them and never reads these.
  home: {
    eyebrow: 'Beyond Every Art in English',
    title: 'Articles in English',
    description: 'Art, color, materials, exhibitions, and creative practice.',
    latest: 'Latest',
    older: 'Older',
    newer: 'Newer',
    page: (n: number, of: number) => `Page ${n} of ${of}`,
  },
  archive: {
    topic: 'Topic',
    author: 'Author',
    count: (n: number) => `${n} ${n === 1 ? 'article' : 'articles'}`,
  },
  search: {
    title: 'Search',
    label: 'Search the archive',
    button: 'Search',
    throttled:
      'That is a lot of searches at once. Give it a moment and try again.',
    prompt: 'Search every article in English.',
    resultsFor: (q: string) => `Results for “${q}”`,
    none: (q: string) => `Nothing matches “${q}” yet.`,
  },
}

/** The shape every language's dictionary has. */
export type Dictionary = typeof en
