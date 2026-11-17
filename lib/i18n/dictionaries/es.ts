// La interfaz del sitio en español. Ver `en.ts` para la forma y las reglas.
//
// UI strings only — articles are translated by people, through the connector.
// Written for this release; worth a native read before launch.

import type { Dictionary } from './en'

export const es: Dictionary = {
  languageName: 'Español',
  switcher: { label: 'Idioma' },
  nav: {
    home: 'Inicio',
    search: 'Buscar',
    feed: 'Canal RSS',
    subscribe: 'Suscribirse',
    primary: 'Principal',
    footer: 'Pie de página',
  },
  common: {
    minutes: (n) => `${n} min`,
    minRead: (n) => `${n} min de lectura`,
    members: 'Miembros',
    subscribers: 'Suscriptores',
    journal: 'Revista',
  },
  chrome: {
    openSearch: 'Abrir búsqueda',
    openMenu: 'Abrir menú',
    closeMenu: 'Cerrar menú',
    searchArchive: 'Buscar en el archivo',
    closeSearch: 'Cerrar búsqueda',
    typeToSearch: 'Escribe para buscar',
    searching: 'Buscando…',
    results: (n) => `${n} ${n === 1 ? 'resultado' : 'resultados'}`,
    toClose: ' para cerrar',
    nothingMatches: ['Todavía no hay nada para ', '.'],
    close: 'Cerrar',
  },
  subscribe: {
    onTheList: 'Ya estás en la lista',
    onTheListBody:
      'Nuevos artículos sobre materiales, técnica y significado, cuando estén listos. El boletín se envía en inglés.',
    done: 'Listo',
    title: 'Sigue de cerca el trabajo',
    lede: 'Lee la revista o apóyala, y accede a los artículos escritos para miembros.',
    chooseMembership: 'Elige una membresía',
    free: 'Gratis',
    fullAccess: 'Acceso completo',
    member: 'Miembro',
    perMonth: '/mes',
    perYear: '/año',
    billingPeriod: 'Periodo de facturación',
    monthly: 'Mensual',
    aMonth: (price) => `$${price} al mes`,
    yearly: 'Anual',
    save: (amount) => `Ahorra $${amount}`,
    continueToPayment: 'Continuar al pago',
    paidNotOpen:
      'La membresía de pago aún no está disponible. Elige Gratis arriba y te escribiremos cuando lo esté.',
    emailPlaceholder: 'tu@ejemplo.com',
    emailAddress: 'Correo electrónico',
    invalidEmail:
      'Esa dirección no parece correcta: revísala e inténtalo de nuevo.',
    serverError:
      'Algo ha fallado por nuestra parte. Inténtalo de nuevo en un momento.',
    subscribing: 'Suscribiendo…',
    subscribe: 'Suscribirse',
    freeSmall:
      'Gratis. Puedes darte de baja de cualquier correo cuando quieras.',
    freeBenefits: [
      'Todos los artículos públicos, completos',
      'El boletín (en inglés) cuando hay un artículo nuevo',
      'Sin tarjeta, sin cargos',
    ],
    paidBenefits: [
      'Todo lo incluido en Gratis',
      'Artículos para miembros y suscriptores',
      'El archivo completo',
      'Apoya la investigación y el trabajo de laboratorio',
    ],
  },
  newsletter: {
    title: 'Sigue de cerca el trabajo',
    body: 'Nuevos artículos sobre materiales, técnica y significado, cuando estén listos. El boletín se envía en inglés.',
  },
  article: {
    emptyBody: 'Este artículo todavía no tiene contenido.',
    allPiecesBy: ['Todos los artículos de ', ' →'],
    inThisPiece: 'En este artículo',
    railLabel: 'Más de Beyond Every Art',
  },
  share: {
    copyLink: 'Copiar enlace',
    email: 'Correo',
    share: 'Compartir',
    copied: 'Enlace copiado',
    pressToCopy: 'Pulsa ⌘C para copiar',
  },
  gate: {
    membersOnly: 'Solo para miembros',
    subscribersOnly: 'Solo para suscriptores',
    restIsFor: 'El resto de este artículo es para ',
    members: 'miembros',
    subscribers: 'suscriptores',
    body: 'Las membresías aún no están abiertas: primero el sitio se muda a su nuevo hogar. Únete a la lista y te enterarás en cuanto lo estén; mientras tanto, recibirás todos los artículos públicos.',
    join: 'Unirme a la lista',
    small: 'Sin crear cuenta, sin pagar nada.',
  },
  rail: {
    newsletter: 'El boletín',
    title: 'Sigue de cerca el trabajo',
    copy: 'Un artículo a la semana sobre color, materiales y práctica. En inglés.',
    join: 'Unirme a la lista',
  },
  promos: {
    fromSite: 'De Beyond Every Art',
    worthReading: 'Vale la pena leer',
    moreFromJournal: 'Más de la revista',
    alsoFrom: 'También en Beyond Every Art',
  },
  readNext: {
    eyebrow: 'Sigue leyendo',
    moreOn: (topic) => `Más sobre ${topic}`,
    moreFromJournal: 'Más de la revista',
  },
  blocks: {
    faqHeading: 'Preguntas frecuentes',
    comparisonTable: 'Tabla comparativa',
    keyTakeaways: 'Ideas clave',
  },
  footer: {
    rights: (year, site) => `© ${year} ${site}. Todos los derechos reservados.`,
  },
  notFound: {
    eyebrow: 'Error 404',
    title: 'Esta página se ha salido del lienzo.',
    body: 'Puede que la página que buscas se haya movido o que nunca haya existido.',
    back: 'Volver al inicio',
  },
  home: {
    eyebrow: 'Beyond Every Art en español',
    title: 'Artículos en español',
    description: 'Arte, color, materiales, exposiciones y práctica creativa.',
    latest: 'Lo más reciente',
    older: 'Anteriores',
    newer: 'Más recientes',
    page: (n, of) => `Página ${n} de ${of}`,
  },
  archive: {
    topic: 'Tema',
    author: 'Autor',
    count: (n) => `${n} ${n === 1 ? 'artículo' : 'artículos'}`,
  },
  search: {
    title: 'Buscar',
    label: 'Buscar en el archivo',
    button: 'Buscar',
    throttled:
      'Son muchas búsquedas seguidas. Espera un momento y vuelve a intentarlo.',
    prompt: 'Busca en todos los artículos en español.',
    resultsFor: (q) => `Resultados para «${q}»`,
    none: (q) => `Todavía no hay nada para «${q}».`,
  },
}
