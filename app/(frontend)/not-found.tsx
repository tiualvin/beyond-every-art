import Link from 'next/link'

import { FadeIn } from './components/motion/fade-in'

export default function NotFound() {
  return (
    <main>
      <section className="section">
        <div className="container" style={{ maxWidth: '34rem' }}>
          <FadeIn>
            <p className="eyebrow">Error 404</p>
            <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3rem)' }}>
              This page has wandered off the canvas.
            </h1>
            <p className="muted">
              The page you are looking for may have moved or never existed.
            </p>
            <Link href="/" className="button button--ghost">
              Back to home
            </Link>
          </FadeIn>
        </div>
      </section>
    </main>
  )
}
