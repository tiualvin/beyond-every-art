import { subscribeToNewsletter } from '@/app/(frontend)/newsletter/actions'

/**
 * How the homepage closes.
 *
 * The site-wide band that used to sit here is the same on every page, which is
 * right for an article foot and wrong for the front door: PRODUCT.md gives the
 * homepage two jobs, and converting a returning reader into a subscriber is the
 * second of them. A band that says "Stay close to the work" on a post, a tag
 * archive and the homepage alike is not doing that job anywhere in particular.
 *
 * **The copy names no cadence, deliberately.** The prototype's line was "One
 * pigment, examined, every Friday", and this publication does not publish on
 * Fridays or on any other schedule — thirty pieces went out in one week in
 * February and then months were quiet. A promise the archive contradicts is
 * worse than a vague one, so this says what is actually true: something arrives
 * when there is something worth sending.
 *
 * It replaces the band on `/` rather than joining it — `NewsletterBand`
 * suppresses itself here for the same reason it does on `/newsletter`, which is
 * that two identically labelled email inputs on one page is a form nobody can
 * fill in confidently.
 */
export function HomepageNewsletter() {
  return (
    <section className="home-signup" aria-labelledby="home-signup-title">
      <div className="container home-signup__inner">
        <div>
          <p className="eyebrow eyebrow--on-dark">The newsletter</p>
          <h2 id="home-signup-title" className="home-signup__title">
            One material, examined, when the piece is ready
          </h2>
          <p className="home-signup__body">
            Where a pigment comes from, how it behaves in a binder, and which
            paintings depend on it. Sent when there is something worth sending —
            not on a schedule that needs padding.
          </p>
        </div>

        <form className="home-signup__form" action={subscribeToNewsletter}>
          {/* A real label rather than the band's `aria-label`: this is the
              page's primary conversion, and a visible one is what lets a
              reader see what the field wants before they click into it. */}
          <label className="home-signup__label" htmlFor="home-signup-email">
            Email address
          </label>
          <div className="home-signup__row">
            <input
              id="home-signup-email"
              className="home-signup__input"
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="you@studio.com"
            />
            <button className="home-signup__btn" type="submit">
              Subscribe
            </button>
          </div>
          <p className="home-signup__small">Free. Unsubscribe in a click.</p>
        </form>
      </div>
    </section>
  )
}
