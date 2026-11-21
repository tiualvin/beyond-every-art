// Antarmuka situs dalam Bahasa Indonesia. Lihat `en.ts` untuk bentuk dan aturannya.
//
// UI strings only — articles are translated by people, through the connector.
// Written for this release; worth a native read before launch.

import type { Dictionary } from './en'

export const id: Dictionary = {
  languageName: 'Bahasa Indonesia',
  switcher: { label: 'Bahasa' },
  nav: {
    home: 'Beranda',
    search: 'Cari',
    feed: 'Umpan RSS',
    subscribe: 'Berlangganan',
    primary: 'Utama',
    footer: 'Kaki halaman',
  },
  common: {
    minutes: (n) => `${n} mnt`,
    minRead: (n) => `${n} menit baca`,
    members: 'Anggota',
    subscribers: 'Pelanggan',
    journal: 'Jurnal',
  },
  chrome: {
    openSearch: 'Buka pencarian',
    openMenu: 'Buka menu',
    closeMenu: 'Tutup menu',
    searchArchive: 'Cari di arsip',
    closeSearch: 'Tutup pencarian',
    typeToSearch: 'Ketik untuk mencari',
    searching: 'Mencari…',
    results: (n) => `${n} hasil`,
    toClose: ' untuk menutup',
    nothingMatches: ['Belum ada yang cocok dengan ', '.'],
    close: 'Tutup',
  },
  subscribe: {
    onTheList: 'Anda sudah terdaftar',
    onTheListBody:
      'Tulisan baru tentang material, teknik, dan makna — dikirim saat sudah siap. Buletin dikirim dalam bahasa Inggris.',
    done: 'Selesai',
    title: 'Ikuti terus karya kami',
    lede: 'Baca jurnalnya atau dukung kami — dan buka tulisan yang ditulis untuk anggota.',
    chooseMembership: 'Pilih keanggotaan',
    free: 'Gratis',
    fullAccess: 'Akses penuh',
    member: 'Anggota',
    perMonth: '/bln',
    perYear: '/thn',
    billingPeriod: 'Periode tagihan',
    monthly: 'Bulanan',
    aMonth: (price) => `$${price} per bulan`,
    yearly: 'Tahunan',
    save: (amount) => `Hemat $${amount}`,
    continueToPayment: 'Lanjut ke pembayaran',
    paidNotOpen:
      'Keanggotaan berbayar belum dibuka. Pilih Gratis di atas dan kami akan mengabari Anda saat sudah dibuka.',
    emailPlaceholder: 'anda@contoh.com',
    emailAddress: 'Alamat email',
    invalidEmail:
      'Alamat itu sepertinya kurang tepat — periksa lalu coba lagi.',
    serverError:
      'Terjadi kesalahan di pihak kami. Silakan coba lagi sebentar lagi.',
    subscribing: 'Mendaftarkan…',
    subscribe: 'Berlangganan',
    freeSmall: 'Gratis. Berhenti berlangganan kapan saja dari email mana pun.',
    freeBenefits: [
      'Semua tulisan publik, lengkap',
      'Buletin (dalam bahasa Inggris) saat ada tulisan baru',
      'Tanpa kartu, tanpa biaya',
    ],
    paidBenefits: [
      'Semua yang ada di paket Gratis',
      'Tulisan khusus anggota dan pelanggan',
      'Arsip lengkap',
      'Mendukung liputan dan kerja laboratorium',
    ],
  },
  newsletter: {
    title: 'Ikuti terus karya kami',
    body: 'Tulisan baru tentang material, teknik, dan makna — dikirim saat sudah siap. Buletin dikirim dalam bahasa Inggris.',
  },
  article: {
    emptyBody: 'Tulisan ini belum memiliki isi.',
    allPiecesBy: ['Semua tulisan oleh ', ' →'],
    inThisPiece: 'Dalam tulisan ini',
    railLabel: 'Lainnya dari Beyond Every Art',
  },
  share: {
    copyLink: 'Salin tautan',
    email: 'Email',
    share: 'Bagikan',
    copied: 'Tautan disalin',
    pressToCopy: 'Tekan ⌘C untuk menyalin',
  },
  gate: {
    membersOnly: 'Khusus anggota',
    subscribersOnly: 'Khusus pelanggan',
    restIsFor: 'Sisa tulisan ini untuk ',
    members: 'anggota',
    subscribers: 'pelanggan',
    body: 'Keanggotaan belum dibuka — situs ini sedang pindah ke rumah baru terlebih dahulu. Bergabunglah dengan daftar dan Anda akan langsung tahu saat dibuka, sekaligus mendapatkan semua tulisan publik sementara itu.',
    join: 'Gabung ke daftar',
    small: 'Tanpa membuat akun, tanpa biaya.',
  },
  rail: {
    newsletter: 'Buletin',
    title: 'Ikuti terus karya kami',
    copy: 'Satu tulisan seminggu tentang warna, material, dan praktik. Dalam bahasa Inggris.',
    join: 'Gabung ke daftar',
  },
  promos: {
    fromSite: 'Dari Beyond Every Art',
    worthReading: 'Layak dibaca',
    moreFromJournal: 'Lainnya dari jurnal',
    alsoFrom: 'Juga dari Beyond Every Art',
  },
  readNext: {
    eyebrow: 'Baca selanjutnya',
    moreOn: (topic) => `Lainnya tentang ${topic}`,
    moreFromJournal: 'Lainnya dari jurnal',
  },
  blocks: {
    faqHeading: 'Pertanyaan yang sering diajukan',
    comparisonTable: 'Tabel perbandingan',
    keyTakeaways: 'Poin penting',
  },
  footer: {
    rights: (year, site) => `© ${year} ${site}. Hak cipta dilindungi.`,
  },
  notFound: {
    eyebrow: 'Galat 404',
    title: 'Halaman ini sudah keluar dari kanvas.',
    body: 'Halaman yang Anda cari mungkin sudah dipindahkan atau memang tidak pernah ada.',
    back: 'Kembali ke beranda',
  },
  home: {
    eyebrow: 'Beyond Every Art dalam Bahasa Indonesia',
    title: 'Tulisan dalam Bahasa Indonesia',
    description: 'Seni, warna, material, pameran, dan praktik kreatif.',
    latest: 'Terbaru',
    older: 'Lebih lama',
    newer: 'Lebih baru',
    page: (n, of) => `Halaman ${n} dari ${of}`,
  },
  archive: {
    topic: 'Topik',
    author: 'Penulis',
    count: (n) => `${n} tulisan`,
  },
  search: {
    title: 'Cari',
    label: 'Cari di arsip',
    button: 'Cari',
    throttled:
      'Terlalu banyak pencarian sekaligus. Tunggu sebentar lalu coba lagi.',
    prompt: 'Cari di semua tulisan dalam Bahasa Indonesia.',
    resultsFor: (q) => `Hasil untuk “${q}”`,
    none: (q) => `Belum ada yang cocok dengan “${q}”.`,
  },
}
