# Apps Page — Design

## Status and intent

This spec covers a new `/apps` page presenting the Beyond Every Art app
ecosystem — the companion app, Dapple, Morrow, and Echo Garden — described in
[`GHOST_TO_PAYLOAD_HANDOFF_WITH_APP_STRATEGY.md`](../../GHOST_TO_PAYLOAD_HANDOFF_WITH_APP_STRATEGY.md).
None of these apps have shipped; Phase 2+ of that document hasn't started.

**Sequencing:** this is a separately-scoped enhancement, not part of the
in-flight Phase 1 Ghost migration work. It should be implemented after the
migration is stable (DNS/TLS live, real Ghost import done, Stripe webhook
takeover complete — see `DEPLOYMENT_STATUS.md`), on its own branch, not folded
into `agent/launch-readiness-framework` or any other migration branch.

## Goal

A page where visitors can see what supplementary apps Beyond Every Art has or
will have — positioning, description, and status for each — with a way to
express interest before an app ships. All four apps start as unshipped
concepts; the page must read honestly as a roadmap, not a store listing.

## Data model

### `Apps` collection (new)

Follows the existing `Pages`/`Posts` collection pattern (`access/roles.ts`,
draft versioning):

```ts
export const Apps: CollectionConfig = {
  slug: 'apps',
  admin: { useAsTitle: 'name' },
  access: {
    create: editorsAndAdmins,
    read: publishedOrEditors,
    update: editorsAndAdmins,
    delete: editorsAndAdmins,
  },
  versions: { drafts: true },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'tagline', type: 'text' }, // "A quiet place to color."
    { name: 'summary', type: 'textarea' }, // short card description
    { name: 'description', type: 'richText' }, // full pitch on the detail page
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'concept',
      options: ['concept', 'in_development', 'coming_soon', 'available'],
    },
    {
      name: 'platforms',
      type: 'select',
      hasMany: true,
      options: ['ios', 'android', 'web'],
    },
    { name: 'heroImage', type: 'upload', relationTo: 'media' },
    {
      name: 'screenshots',
      type: 'array',
      fields: [
        { name: 'image', type: 'upload', relationTo: 'media', required: true },
      ],
    },
    { name: 'appStoreURL', type: 'text' },
    { name: 'playStoreURL', type: 'text' },
    { name: 'order', type: 'number', defaultValue: 0 },
  ],
}
```

`slug` does **not** need `validateRootContentSlug` — it's scoped under
`/apps/[slug]`, not the root, so it can't collide with a migrated Ghost
post/page slug.

Four documents get created at launch (companion app, Dapple, Morrow, Echo
Garden), all `status: 'concept'` and unpublished until there's something worth
showing. Editors update copy and status from the Payload admin UI with no code
deploy required, same as editing a `Page`.

### `AppWaitlist` collection (new)

A dedicated collection, kept separate from `NewsletterSignups` so the general
newsletter flow's schema, access rules, and single-email-per-row semantics
stay untouched:

```ts
export const AppWaitlist: CollectionConfig = {
  slug: 'app-waitlist',
  admin: {
    useAsTitle: 'email',
    description: 'Per-app "notify me" signups captured from /apps/[slug].',
  },
  access: {
    create: adminOnly, // writes go through the server action with overrideAccess
    read: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  fields: [
    { name: 'email', type: 'email', required: true, index: true },
    {
      name: 'app',
      type: 'relationship',
      relationTo: 'apps',
      required: true,
      index: true,
    },
    { name: 'source', type: 'text' },
  ],
}
```

`(email, app)` should be unique as a pair — one signup per person per app, but
the same person can join multiple apps' waitlists. Payload's `unique: true`
is single-field only, so this needs a `beforeValidate` hook that queries for
an existing `(email, app)` match and short-circuits as a no-op success rather
than inserting a duplicate (mirrors how the newsletter action already treats
a duplicate-email error as success).

## Routes

- `app/(frontend)/apps/page.tsx` — overview. Cards for each published app
  (name, tagline, status badge, hero image), sorted by `order`. Follows the
  `section`/`container`/`eyebrow` visual language already used on
  `/newsletter` and the homepage.
- `app/(frontend)/apps/[slug]/page.tsx` — detail. Full description,
  screenshots, platform badges, and a status-aware CTA:
  - `concept` / `in_development` / `coming_soon` → "Notify me" waitlist form.
  - `available` → link out via `appStoreURL` / `playStoreURL` instead of the
    waitlist form.
- Add `'apps'` to `RESERVED_ROOT_SLUGS`
  (`lib/seo/reserved-slugs.ts`) so a migrated Ghost post/page can never claim
  the root `apps` slug and get shadowed by this route.
- Add to `lib/seo/site.ts`, matching the existing `JOURNAL_PATH` /
  `publicationPath` style (no trailing slash — this is a new route with no
  pre-migration URL to protect):
  ```ts
  export const APPS_PATH = '/apps'
  export const appPath = (slug: string): string => `${APPS_PATH}/${slug}`
  ```
- `lib/content/queries.ts` gains `getApps()` (published, ordered) and
  `getAppBySlug(slug)`, typed the same way `PostCard` is today.
- Extend `app/sitemap.ts` / `buildSitemapEntries` to include published apps,
  same shape as the existing posts/pages/tags/authors fetch.
- Add "Apps" to the Header global's editorial nav (Payload) and to
  `FALLBACK_NAV` in `site-header.tsx` — every fallback entry must be a route
  this app always serves, and `/apps` will be once shipped.

## Waitlist action

`app/(frontend)/apps/[slug]/actions.ts`, mirroring
`app/(frontend)/newsletter/actions.ts`:

```ts
'use server'
export async function joinAppWaitlist(appSlug: string, formData: FormData) {
  // validate email with the same EMAIL_PATTERN used by the newsletter action
  // resolve the Apps doc by slug
  // payload.create({ collection: 'app-waitlist', data: { email, app: app.id, source: `apps-page:${appSlug}` }, overrideAccess: true })
  // duplicate (email, app) → treated as success, not an error
  // redirect(`${appPath(appSlug)}?status=success|invalid|error`)
}
```

## Error handling & access

- `AppWaitlist.create` is locked to `adminOnly` in Payload's access control;
  the only write path is the server action with `overrideAccess: true` — same
  reasoning as `NewsletterSignups` (an open `create` would expose an
  unauthenticated POST endpoint and a way to probe existing signups).
- `Apps.read` uses `publishedOrEditors`: unpublished/draft apps are invisible
  to the public overview, detail route, nav, and sitemap, but editors can
  preview them in the admin UI the same way they preview a `Page`.
- An unknown or unpublished `/apps/[slug]` renders the existing `not-found`
  page, matching how the `[slug]` catch-all already 404s for unknown content.

## Testing

- Unit tests for `getApps()` / `getAppBySlug()` (published-only filtering,
  ordering), alongside the existing content-query tests.
- Unit tests for `joinAppWaitlist`: valid email, invalid email, duplicate
  `(email, app)` pair (must not throw, must still redirect to success).
- Extend the `reserved-slugs` test to assert `'apps'` is reserved.
- Extend the sitemap test to include published app entries and exclude drafts.
- A Playwright smoke test: `/apps` lists only published apps; `/apps/[slug]`
  404s for an unknown or unpublished slug; the waitlist form on a `concept`
  app submits and shows a success message.

## Rollout

Purely additive — no feature flag needed. Apps ship as Payload drafts,
`status: 'concept'`, unpublished. As each app strategy phase progresses, an
editor publishes the doc and advances `status`; when an app reaches
`available`, its detail page switches from the waitlist form to real store
links. Nothing here touches the Ghost migration's data model, redirects, or
deployment pipeline.
