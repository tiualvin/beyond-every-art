'use client'

import { dictionaryFor } from '@/lib/i18n/dictionaries'

import { usePathname } from 'next/navigation'

import { subscribeToNewsletter } from '@/app/(frontend)/newsletter/actions'
import { hasOwnSignup } from '@/lib/content/signup-paths'

export function NewsletterBand({ locale }: { locale?: string } = {}) {
  const pathname = usePathname()
  // Off wherever the page carries a signup already — see `hasOwnSignup`.
  if (hasOwnSignup(pathname)) return null
  const t = dictionaryFor(locale)

  return (
    <section className="newsletter-band">
      <div className="container newsletter-band__inner">
        <div>
          <h2>{t.newsletter.title}</h2>
          <p>{t.newsletter.body}</p>
        </div>
        <form className="newsletter-band__form" action={subscribeToNewsletter}>
          <input
            className="newsletter-band__input"
            type="email"
            name="email"
            required
            placeholder={t.subscribe.emailPlaceholder}
            aria-label={t.subscribe.emailAddress}
          />
          <button className="newsletter-band__btn" type="submit">
            {t.subscribe.subscribe}
          </button>
        </form>
      </div>
    </section>
  )
}
