import { subscribeToNewsletter } from '@/app/(frontend)/newsletter/actions'

export function NewsletterBand() {
  return (
    <section className="newsletter-band">
      <div className="container newsletter-band__inner">
        <div>
          <h2>Stay close to the work</h2>
          <p>
            New stories on materials, technique, and meaning — delivered when
            they&rsquo;re ready.
          </p>
        </div>
        <form className="newsletter-band__form" action={subscribeToNewsletter}>
          <input
            className="newsletter-band__input"
            type="email"
            name="email"
            required
            placeholder="you@example.com"
            aria-label="Email address"
          />
          <button className="newsletter-band__btn" type="submit">
            Subscribe
          </button>
        </form>
      </div>
    </section>
  )
}
