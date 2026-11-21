// Die Oberfläche der Website auf Deutsch. Form und Regeln: siehe `en.ts`.
//
// UI strings only — articles are translated by people, through the connector.
// Written for this release; worth a native read before launch.

import type { Dictionary } from './en'

export const de: Dictionary = {
  languageName: 'Deutsch',
  switcher: { label: 'Sprache' },
  nav: {
    home: 'Startseite',
    search: 'Suche',
    feed: 'RSS-Feed',
    subscribe: 'Abonnieren',
    primary: 'Hauptnavigation',
    footer: 'Fußzeile',
  },
  common: {
    minutes: (n) => `${n} Min.`,
    minRead: (n) => `${n} Min. Lesezeit`,
    members: 'Mitglieder',
    subscribers: 'Abonnenten',
    journal: 'Journal',
  },
  chrome: {
    openSearch: 'Suche öffnen',
    openMenu: 'Menü öffnen',
    closeMenu: 'Menü schließen',
    searchArchive: 'Im Archiv suchen',
    closeSearch: 'Suche schließen',
    typeToSearch: 'Zum Suchen tippen',
    searching: 'Suche läuft…',
    results: (n) => `${n} ${n === 1 ? 'Ergebnis' : 'Ergebnisse'}`,
    toClose: ' zum Schließen',
    nothingMatches: ['Noch keine Treffer für ', '.'],
    close: 'Schließen',
  },
  subscribe: {
    onTheList: 'Sie stehen auf der Liste',
    onTheListBody:
      'Neue Beiträge über Material, Technik und Bedeutung – sobald sie fertig sind. Der Newsletter erscheint auf Englisch.',
    done: 'Fertig',
    title: 'Bleiben Sie nah an der Arbeit',
    lede: 'Lesen Sie das Journal oder unterstützen Sie es – und öffnen Sie die Beiträge für Mitglieder.',
    chooseMembership: 'Mitgliedschaft wählen',
    free: 'Kostenlos',
    fullAccess: 'Voller Zugang',
    member: 'Mitglied',
    perMonth: '/Monat',
    perYear: '/Jahr',
    billingPeriod: 'Abrechnungszeitraum',
    monthly: 'Monatlich',
    aMonth: (price) => `$${price} pro Monat`,
    yearly: 'Jährlich',
    save: (amount) => `$${amount} sparen`,
    continueToPayment: 'Weiter zur Zahlung',
    paidNotOpen:
      'Die bezahlte Mitgliedschaft ist noch nicht geöffnet. Wählen Sie oben „Kostenlos“, und wir schreiben Ihnen, sobald es so weit ist.',
    emailPlaceholder: 'sie@beispiel.de',
    emailAddress: 'E-Mail-Adresse',
    invalidEmail:
      'Diese Adresse scheint nicht zu stimmen – bitte prüfen und erneut versuchen.',
    serverError:
      'Bei uns ist etwas schiefgelaufen. Bitte versuchen Sie es gleich noch einmal.',
    subscribing: 'Wird angemeldet…',
    subscribe: 'Abonnieren',
    freeSmall: 'Kostenlos. Abmeldung jederzeit über jede E-Mail.',
    freeBenefits: [
      'Jeder öffentliche Beitrag, vollständig',
      'Der Newsletter (auf Englisch), wenn ein Beitrag fertig ist',
      'Keine Karte, keine Kosten',
    ],
    paidBenefits: [
      'Alles aus „Kostenlos“',
      'Beiträge nur für Mitglieder und Abonnenten',
      'Das vollständige Archiv',
      'Unterstützt die Recherche und die Laborzeit',
    ],
  },
  newsletter: {
    title: 'Bleiben Sie nah an der Arbeit',
    body: 'Neue Beiträge über Material, Technik und Bedeutung – sobald sie fertig sind. Der Newsletter erscheint auf Englisch.',
  },
  article: {
    emptyBody: 'Dieser Beitrag hat noch keinen Inhalt.',
    allPiecesBy: ['Alle Beiträge von ', ' →'],
    inThisPiece: 'In diesem Beitrag',
    railLabel: 'Mehr von Beyond Every Art',
  },
  share: {
    copyLink: 'Link kopieren',
    email: 'E-Mail',
    share: 'Teilen',
    copied: 'Link kopiert',
    pressToCopy: 'Zum Kopieren ⌘C drücken',
  },
  gate: {
    membersOnly: 'Nur für Mitglieder',
    subscribersOnly: 'Nur für Abonnenten',
    restIsFor: 'Der Rest dieses Beitrags ist für ',
    members: 'Mitglieder',
    subscribers: 'Abonnenten',
    body: 'Mitgliedschaften sind noch nicht geöffnet – die Website zieht zuerst um. Tragen Sie sich in die Liste ein: Sie erfahren es sofort, sobald es so weit ist, und erhalten bis dahin jeden öffentlichen Beitrag.',
    join: 'In die Liste eintragen',
    small: 'Kein Konto nötig, nichts zu bezahlen.',
  },
  rail: {
    newsletter: 'Der Newsletter',
    title: 'Bleiben Sie nah an der Arbeit',
    copy: 'Ein Beitrag pro Woche über Farbe, Material und Praxis. Auf Englisch.',
    join: 'In die Liste eintragen',
  },
  promos: {
    fromSite: 'Von Beyond Every Art',
    worthReading: 'Lesenswert',
    moreFromJournal: 'Mehr aus dem Journal',
    alsoFrom: 'Ebenfalls bei Beyond Every Art',
  },
  readNext: {
    eyebrow: 'Weiterlesen',
    moreOn: (topic) => `Mehr zu ${topic}`,
    moreFromJournal: 'Mehr aus dem Journal',
  },
  blocks: {
    faqHeading: 'Häufige Fragen',
    comparisonTable: 'Vergleichstabelle',
    keyTakeaways: 'Das Wichtigste in Kürze',
  },
  footer: {
    rights: (year, site) => `© ${year} ${site}. Alle Rechte vorbehalten.`,
  },
  notFound: {
    eyebrow: 'Fehler 404',
    title: 'Diese Seite hat die Leinwand verlassen.',
    body: 'Die gesuchte Seite wurde möglicherweise verschoben oder hat nie existiert.',
    back: 'Zur Startseite',
  },
  home: {
    eyebrow: 'Beyond Every Art auf Deutsch',
    title: 'Beiträge auf Deutsch',
    description: 'Kunst, Farbe, Material, Ausstellungen und kreative Praxis.',
    latest: 'Neueste Beiträge',
    older: 'Ältere',
    newer: 'Neuere',
    page: (n, of) => `Seite ${n} von ${of}`,
  },
  archive: {
    topic: 'Thema',
    author: 'Autor',
    count: (n) => `${n} ${n === 1 ? 'Beitrag' : 'Beiträge'}`,
  },
  search: {
    title: 'Suche',
    label: 'Im Archiv suchen',
    button: 'Suchen',
    throttled:
      'Das sind viele Suchanfragen auf einmal. Bitte einen Moment warten und erneut versuchen.',
    prompt: 'Alle Beiträge auf Deutsch durchsuchen.',
    resultsFor: (q) => `Ergebnisse für „${q}“`,
    none: (q) => `Noch keine Treffer für „${q}“.`,
  },
}
