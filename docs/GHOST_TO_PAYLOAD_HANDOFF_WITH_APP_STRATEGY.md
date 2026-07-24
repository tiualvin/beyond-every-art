# Ghost to Next.js + Payload CMS Migration Handoff

## Project Summary

The current website is hosted on Ghost. The goal is to migrate it to a cheaper, self-hosted platform using:

- Next.js
- Payload CMS
- PostgreSQL
- Cloudflare
- A low-cost VPS

The new platform should preserve all existing content, media, URLs, SEO value, redirects, authors, tags, subscribers, and site structure.

The initial migration should prioritize functional parity with the current Ghost website. Redesigns and new functionality should be handled after the migration is stable.

The longer-term goal is for Payload CMS and PostgreSQL to become the shared content and account platform for the Beyond Every Art website and a family of creative mobile applications. The migration must therefore avoid decisions that unnecessarily limit future mobile clients, interactive art tools, subscriptions, saved projects, or cross-app content distribution.

The future app strategy must not delay or destabilize the Ghost migration. App-specific collections and services should be introduced incrementally after the website is operating reliably.

---

# Main Goals

1. Reduce monthly hosting costs.
2. Own and control the website infrastructure.
3. Migrate all Ghost content without losing data.
4. Preserve existing URLs and search engine rankings.
5. Make the site easier to customize through Next.js.
6. Use Payload CMS as the content administration system.
7. Avoid recreating unnecessary Ghost functionality during the first migration phase.
8. Keep the infrastructure simple enough to maintain.
9. Allow Payload to become a shared backend for the website and future mobile applications.
10. Structure editorial and art content so it can be reused across web, mobile, audio, coloring, journaling, and interactive experiences.
11. Keep future app identities distinct rather than naming every product "Beyond X."
12. Support a shared Beyond Every Art account and entitlement system when the app ecosystem is introduced.

---


# Expanded Product Vision

Beyond Every Art should be treated as both:

1. The editorial publication and main website.
2. The parent creative studio behind a family of focused art applications.

The mobile products should have their own memorable names and identities. They may be presented as:

```text
Dapple — from Beyond Every Art
Morrow — from Beyond Every Art
Echo Garden — from Beyond Every Art
```

The exact product names remain working names and should be checked for App Store conflicts, trademarks, domain availability, and social-handle availability before launch.

The products should feel related through:

- Typography
- Illustration direction
- Editorial voice
- Color systems
- Artist partnerships
- Shared accounts
- Shared premium entitlements where appropriate
- Cross-app links and content

They should not all be named using a repetitive `Beyond ...` convention.

---

# Proposed App Ecosystem

## 1. Beyond Every Art Mobile App

### Role

The official companion application for `beyondeveryart.com`.

This should not be a simple WebView or a repackaged website. It should be a native reading, discovery, and interactive art companion that uses the same Payload content as the Next.js website.

### Proposed positioning

```text
Beyond Every Art
Art, color, materials, exhibitions, and creative practice.
```

### Primary sections

#### Today

- Featured article
- Pigment or color of the day
- Short creative exercise
- Artwork to examine
- Exhibition highlight
- Daily prompt

#### Read

- Native article reader
- Topics and series
- Search
- Offline reading
- Saved articles
- Reading history
- Highlights and private notes
- Optional narrated or audio editions

#### Explore

- Artists
- Artworks
- Pigments
- Palettes
- Materials
- Exhibitions
- Curated collections

#### Studio

- Palette builder
- Color-context experiments
- Virtual pigment mixing
- Limited-palette challenges
- Composition exercises
- Daily creative prompts

#### Library

- Bookmarks
- Highlights
- Notes
- Saved palettes
- Completed exercises
- Downloads

### Why it matters

This app turns the publication into a recurring creative destination rather than only an article archive. It also becomes the central discovery hub for the other apps.

---

## 2. Dapple

### Concept

A premium freehand coloring app for adults inspired by the quality and calmness of products such as Lake, without copying its branding, artwork, interface, or proprietary assets.

This is not primarily color-by-number. Users should be able to color illustrations freely with realistic digital media and optional boundary assistance.

### Working positioning

```text
Dapple
A quiet place to color.
```

### Core experience

- Artist-made adult coloring illustrations
- Watercolor, pencil, pastel, marker, ink, and textured brushes
- Apple Pencil pressure support where available
- Adjustable brush size and opacity
- Optional stay-inside-the-lines assistance
- Custom palettes
- Artist-curated palettes
- Mood-based palettes
- Paper and canvas textures
- Undo, redo, autosave, and project recovery
- Ambient paper and drawing sounds
- Daily free page
- Artist profiles and collections
- Finished-art gallery
- Wallpaper and high-resolution export

### Possible editorial collection names

- Rooms After Midnight
- Wild Botanicals
- Small Rituals
- Celestial Gardens
- Quiet Figures
- Strange Little Houses
- Dreaming in Blue
- Sunday Objects

### Monetization possibilities

- Free starter collection
- One rotating free page per day
- Monthly or annual premium subscription
- Individual artist packs
- Seasonal coloring collections
- Printable coloring books
- High-resolution exports
- Optional physical prints of completed work

### Payload-managed content

- Illustrations
- Coloring collections
- Artists
- Suggested palettes
- Brush packs
- Difficulty levels
- Daily featured pages
- Product placements
- App announcements
- Subscription entitlement metadata

Large editable project files should normally be stored locally or in object storage. Payload should store ownership, metadata, thumbnails, version references, and synchronization status rather than placing large binary projects directly in PostgreSQL.

---

## 3. Morrow

### Concept

An art planner, visual journal, and creative diary. It combines planning, handwriting, drawing, collage, reflection, and mood tracking without feeling like a corporate productivity app.

### Working positioning

```text
Morrow
Make a little space for yourself.
```

### Core experience

- Daily and weekly planning pages
- Personal journals and notebooks
- Apple Pencil handwriting and drawing
- Art stickers and decorative tape
- Paper themes and page templates
- Photo placement and cutouts
- Mood boards
- Vision boards
- Habit and ritual tracking
- Creative prompts
- Monthly review pages
- PDF and image export
- Optional printed yearly journal or art book

### Distinctive feature: visual mood tracking

Instead of selecting only an emoji, users can represent a day through:

- A color
- A brushstroke
- A shape
- A small drawing
- A photograph
- An optional sound

These daily marks can become a visual month or an abstract yearly artwork.

### Monetization possibilities

- Free basic journal
- Premium notebook themes
- Sticker packs
- Paper and template packs
- Artist-designed planners
- Subscription for unlimited notebooks, sync, and premium tools
- Printed journals or annual art books

### Privacy requirements

Journal data must be treated as private user content, not ordinary CMS content.

The implementation should consider:

- Strict document-level access control
- Encryption for sensitive synchronized content
- Device-local storage by default where practical
- Optional encrypted cloud sync
- Private exports
- Account deletion and data-export controls
- No admin browsing of private journals except when technically required and explicitly documented

### Payload-managed content

- Journal templates
- Planner layouts
- Prompt packs
- Sticker packs
- Paper themes
- Brush packs
- Seasonal collections
- Public artist collections
- User project metadata
- Sync manifests and entitlement records

---

## 4. Echo Garden

### Concept

An atmospheric art-and-sound game in which creative actions restore music and life to quiet environments.

The emotional spaciousness and softness may be inspired by games such as *Sky: Children of the Light*, but the product must use its own world, characters, interactions, compositions, sound library, visual identity, and narrative.

### Working positioning

```text
Echo Garden
Paint a world that sings back.
```

### Core loop

1. Enter a silent or incomplete environment.
2. Discover an object, landscape, or creature missing its color or sound.
3. Paint, trace, arrange, or complete a visual pattern.
4. Each mark creates a musical response.
5. The completed artwork restores part of the environment.
6. The player unlocks a path, memory, instrument, or new creative ability.

### Example art-to-sound mapping

- Dots create bells or plucked notes.
- Long strokes create strings or wind tones.
- Spirals create vocal textures.
- Watercolor washes create atmospheric pads.
- Metallic or gold marks create chimes.
- Repeated patterns introduce percussion.
- Different colors can control instrument families, pitch ranges, or harmony.

The system should harmonize imperfect input so that users do not need formal drawing or musical skill to create something beautiful.

### Possible environments

- An abandoned garden
- A floating observatory
- A moonlit forest
- A submerged temple
- A valley of enormous flowers
- A ruined glasshouse

### Original sound direction

Potential instrument families include:

- Celesta
- Soft piano
- Handpan
- Glass-like percussion
- Breath-like woodwinds
- Plucked strings
- Wordless vocal textures
- Environmental recordings
- Warm synthesized pads

All music and sound effects must be original, commissioned, properly licensed, or created from assets whose licenses explicitly allow the intended commercial use.

### Monetization possibilities

- Premium paid game
- Free opening chapter with paid world packs
- Cosmetic brush trails
- Additional instrument sets
- Seasonal environments
- Soundtrack purchase

Aggressive advertising, energy systems, and manipulative mobile-game monetization should be avoided because they would undermine the intended atmosphere.

### Backend role

Payload may manage:

- Worlds and chapter metadata
- Downloadable content manifests
- Seasonal releases
- Sound and visual asset metadata
- Player profiles and unlocks
- Entitlements
- Announcements
- Cloud-save metadata

The actual rendering, audio synthesis, interactions, and gameplay should remain in the selected game engine or native client. Payload is the content and account backend, not the real-time game engine.

---


# Mobile Technology and Platform Strategy

## Current architecture baseline

The current baseline is:

- One Next.js + Payload website
- Three independently distributed mobile apps
- Dapple on iOS and Android
- Morrow on iOS and Android
- Echo Garden on iOS and Android

This means the organization will maintain three mobile source applications but produce six store binaries: one iOS and one Android build for each app.

The optional Beyond Every Art publication companion app described earlier can be added later, or some of its functions can initially remain in the responsive website or a progressive web app. It should not be allowed to expand the initial mobile scope accidentally.

## Expo-first decision

Use Expo and React Native as the default mobile foundation for Dapple, Morrow, and the first Echo Garden prototype.

This is preferable to building each product separately in Swift and Kotlin because:

- Each app can use one shared TypeScript codebase for iOS and Android.
- The apps can share types, authentication, API clients, analytics definitions, design tokens, and entitlement logic with the Next.js and Payload stack.
- Each app can still have platform-specific components and behavior.
- Native Swift or Kotlin modules can be introduced when a feature genuinely requires lower-level access or better performance.
- Each application remains independently buildable, testable, deployable, and publishable.

Expo should not be interpreted as a requirement to make iOS and Android look identical. The products should share brand identity while respecting each platform's navigation, input, accessibility, and visual conventions.

## App-by-app implementation guidance

### Dapple

Recommended foundation:

```text
Expo / React Native
├── Expo Router and native navigation
├── React Native Skia drawing canvas
├── Payload content and account APIs
├── Local project storage
├── Object-storage synchronization
├── RevenueCat or native store entitlements
└── Optional native Swift/Kotlin modules where profiling proves necessary
```

The coloring canvas should not be implemented as a large hierarchy of ordinary React Native views. Use a dedicated rendering layer for strokes, paths, masks, fills, zooming, panning, compositing, undo history, and export.

Performance tests should cover:

- Apple Pencil and Android stylus latency
- Large and highly detailed vector illustrations
- Memory use during zoom and export
- High-resolution image generation
- Project recovery after application termination
- Long undo and redo histories
- Older supported devices

Start with React Native Skia. Create native Swift or Kotlin modules only when profiling identifies a real bottleneck that cannot be solved adequately in the cross-platform rendering layer.

### Morrow

Expo is a strong fit for:

- Native navigation
- Planning and journal pages
- Drawing and handwriting
- Photos and attachments
- Templates and sticker packs
- Local-first storage
- Secure synchronization
- Notifications
- Subscriptions

Private journal content must remain subject to the privacy and encryption requirements defined elsewhere in this handoff.

### Echo Garden

Expo is suitable for the first version when the product is:

- Two-dimensional
- Touch and gesture driven
- Structured around illustrated scenes
- Focused on drawing, particles, animation, and responsive audio
- More similar to an interactive musical story than a conventional 3D game

Re-evaluate the engine if Echo Garden becomes:

- A freely explorable 3D world
- Multiplayer
- Physics-heavy
- Dependent on complex real-time lighting and shaders
- Built around large environment, model, texture, and audio asset pipelines

In that case, move Echo Garden to Unity or Godot in a separate repository while continuing to use Payload through secured APIs for accounts, content manifests, entitlements, announcements, and cloud-save metadata.

## Native escape hatches

Expo does not prevent native development. The implementation may include:

- Swift or SwiftUI code for iOS-only capabilities
- Kotlin or Jetpack Compose code for Android-only capabilities
- Reusable local Expo modules stored inside the monorepo
- Generated native projects when custom native configuration is required

Native code should be introduced deliberately rather than as the default. Every custom module creates additional upgrade, testing, and maintenance responsibility across both platforms.

## iOS Liquid Glass design

The iOS versions may use Apple's native Liquid Glass system design where supported.

Recommended implementation layers:

```text
Expo application
├── Expo Router native stacks, tabs, and system navigation
├── @expo/ui SwiftUI components for native iOS controls
├── expo-glass-effect for selected custom glass surfaces
├── React Native components for shared application structure
└── React Native Skia for the artwork or creative canvas
```

Native Liquid Glass requires a compatible Expo SDK and native build toolchain and is available only on supported Apple operating-system versions. The application must check feature availability at runtime and provide a normal, polished fallback on older systems or when transparency effects are limited by accessibility settings.

Liquid Glass should be used primarily for navigation and controls layered above content, not as a decorative treatment on every card or background.

### Recommended usage by app

#### Dapple

- Floating brush toolbar
- Palette selector
- Undo and redo controls
- Artwork information sheet
- Export and share controls
- Compact bottom navigation

The coloring artwork should remain the dominant visual layer. Glass controls should be dismissible and must maintain contrast over both light and dark illustrations.

#### Morrow

- Date and notebook navigation
- Floating pen and highlighter controls
- Sticker drawer
- Search and filtering controls
- Context menus and sheets

#### Echo Garden

- Instrument selector
- Sound controls
- Pause and settings controls
- Collectible information cards
- Minimal world navigation

### Android visual treatment

Android will not use Apple's native Liquid Glass material. Create an Android-specific translucent surface system that uses the same Beyond Every Art colors, spacing, iconography, and motion principles while following Android interaction and accessibility expectations.

Do not attempt to reproduce Apple's effect pixel-for-pixel. The goal is a related brand experience, not a counterfeit iOS interface.

### Accessibility and resilience

All translucent interfaces must be tested with:

- Reduce Transparency or equivalent settings
- Reduced motion
- Increased contrast
- Dynamic text sizes
- Light and dark modes
- Bright, dark, and highly saturated artwork behind controls
- Older devices and unsupported operating-system versions

Critical actions must never depend on translucency alone. Buttons, labels, focus states, and selected states need clear semantic and visual indicators.

## Independent app identities and builds

Each Expo app requires its own:

- iOS bundle identifier
- Android application ID
- App Store and Play Store records
- App icon and splash assets
- Deep-link scheme and universal/app links
- Push-notification credentials
- Analytics application identity
- Subscription and in-app purchase products
- Environment variables
- EAS project and build configuration
- Privacy disclosures and store metadata

Suggested identifiers:

```text
Dapple
- iOS: com.beyondeveryart.dapple
- Android: com.beyondeveryart.dapple

Morrow
- iOS: com.beyondeveryart.morrow
- Android: com.beyondeveryart.morrow

Echo Garden
- iOS: com.beyondeveryart.echogarden
- Android: com.beyondeveryart.echogarden
```

Confirm identifier ownership before registering store records. Identifiers should be treated as difficult to change after release.

## Shared versus separate code

Good candidates for shared packages:

- Payload-generated TypeScript types
- Authenticated API client
- Authentication and session utilities
- Entitlement and subscription models
- Content and artwork domain models
- Design tokens
- Icon source assets
- Validation schemas
- Analytics event definitions
- Media URL helpers
- Feature-flag definitions
- Error-reporting setup

Do not force all products to share one universal UI component library. The Next.js website uses React DOM, while Expo uses React Native, and each mobile app has a distinct product experience. Share tokens and behavior first; share visual components only when they are genuinely reusable.


# Cross-App Ecosystem

The products should remain useful independently while sharing selected content and identity.

Examples:

| Starting point | Connected experience |
|---|---|
| Read an article about limited palettes in Beyond Every Art | Open the featured palette in Dapple |
| Complete a creative exercise | Save the prompt or result to Morrow |
| Read an article about color and sound | Open a related Echo Garden experience |
| Save an artist or collection | Follow that artist across available apps |
| Purchase an eligible premium plan | Receive the corresponding cross-app entitlement |

Cross-app integrations should be additive. A user should not be forced to install every app to complete a basic task.

---

# Recommended Product Sequence

The website migration remains Phase 1.

## Phase 1 — Ghost migration and platform stability

- Migrate Ghost content, members, media, URLs, SEO, and redirects.
- Establish reliable deployments and backups.
- Create a stable Payload editorial model.
- Do not make launch dependent on mobile app features.

## Phase 2 — Beyond Every Art companion app

Start with:

- Native article feed and reader
- Topics and search
- Bookmarks
- Offline reading
- Daily color or pigment card
- Simple palette builder
- Push notifications
- Member sign-in

This is the lowest-risk app because it uses content the publication already owns.

## Phase 3 — Dapple MVP

Start with:

- 30–50 strong illustrations
- Five polished brushes
- Boundary assistance
- Artist and custom palettes
- Apple Pencil support
- Autosave
- Daily free page
- Export
- Basic premium entitlement

The drawing canvas, palette system, media pipeline, and account services can later be reused by Morrow.

## Phase 4 — Morrow MVP

Build on the shared canvas and account foundation with:

- Notebooks
- Daily pages
- Drawing and handwriting
- Templates
- Stickers
- Visual mood tracking
- Local-first private storage
- Optional secure synchronization

## Phase 5 — Echo Garden prototype

Begin as a small vertical slice rather than a full live-service game:

- One environment
- One art-to-sound mechanic
- One complete restoration sequence
- A small original sound palette
- A clear beginning and ending

Echo Garden should be treated as the highest-risk and most creatively ambitious product.

---

# Product and Brand Principles

- Beyond Every Art is the publication and parent studio.
- Individual apps should have distinct, memorable names.
- Editorial quality and artist credit should be visible throughout the products.
- The apps should feel calm, premium, and adult rather than childish or content-farm driven.
- Do not compete solely through enormous volumes of generic content.
- Commission, license, or create all illustrations, music, brushes, fonts, and media appropriately.
- Do not copy another application's protected artwork, brand, exact interface, sound assets, or proprietary implementation.
- Accessibility should include scalable text, high-contrast options, reduced motion, captions where relevant, and alternatives to audio-only feedback.
- Cross-app subscriptions and purchases must respect Apple, Google, Stripe, and regional platform rules in effect at launch.
- The initial website migration and ongoing SEO must not be compromised by app development.

---

# Current Platform

## CMS

Ghost

## Data that may exist in Ghost

- Posts
- Pages
- Drafts
- Scheduled posts
- Tags
- Authors and staff users
- Featured images
- Images embedded inside posts
- Audio and video uploads
- Navigation
- Site settings
- SEO metadata
- Canonical URLs
- Redirects
- Custom routes
- Members and subscribers
- Paid members
- Newsletter settings
- Post analytics
- Custom theme
- Custom code injection
- Stripe subscription data
- Third-party integrations

The migration should not assume that the standard Ghost JSON export contains everything.

---

# Target Architecture

## Application

- Next.js using the App Router
- Payload CMS integrated directly into the Next.js project
- TypeScript
- Node.js runtime
- A web-first implementation for the migration phase
- Secured REST, GraphQL, or purpose-built API endpoints for future mobile clients

The Next.js website may use Payload's Local API when running in the same application. Mobile apps should access Payload through authenticated network APIs and should never receive administrative credentials or unrestricted database access.

## CMS

Payload CMS should provide:

- Admin dashboard
- Content editing
- Draft and published states
- Authentication
- Media management
- REST or GraphQL APIs
- Role-based access
- Preview functionality
- Scheduled publishing, where practical

The Payload admin interface should be available at:

```text
/admin
```

## Database

Preferred initial setup:

- PostgreSQL
- Hosted on the same VPS as the application
- Persistent Docker volume
- Automated off-server backups

Supabase is not required for the initial version.

Supabase may be considered later when managed PostgreSQL, easier recovery, realtime features, or Supabase authentication are specifically needed.

## Hosting

Preferred low-cost setup:

- Hetzner VPS or a comparable low-cost provider
- Approximately 4 GB RAM
- Docker Compose
- Caddy as reverse proxy
- Automatic HTTPS
- Cloudflare DNS and CDN

## Media Storage

Preferred:

- Cloudflare R2
- Payload S3-compatible storage adapter
- Public media URL through a custom domain or Cloudflare delivery URL

Media should not rely solely on the VPS filesystem because application redeployments and server failures could cause data loss.

## Email

For transactional messages:

- Resend or another low-cost transactional email provider

For newsletters:

- Do not rebuild Ghost newsletters during the first migration unless currently essential.
- Listmonk may be added later.
- An external SMTP provider will still be required for newsletter delivery.

## Backups

The production setup must include:

- Nightly PostgreSQL backups
- Database backups uploaded to Cloudflare R2 or another off-server location
- Media stored outside the VPS
- Environment variables backed up securely
- Optional VPS snapshots or provider backups
- Documented restoration procedure

---

# Expected Monthly Cost

Approximate target operating cost:

- VPS: €5–€10 per month
- Cloudflare DNS and CDN: free tier
- Cloudflare R2: free or very low cost at small usage levels
- Transactional email: free or low-cost tier
- Domain: existing domain cost
- Optional VPS backups: additional charge

The target is to operate the site for substantially less than a managed Ghost subscription.

Actual prices must be checked before deployment.

---

# Required Ghost Exports

Do not cancel Ghost until all exports, media, and migration verification are complete.

## 1. Content and Settings Export

In Ghost Admin:

```text
Settings
→ Advanced
→ Import/Export
→ Export
→ Content & settings
```

Download the generated JSON file.

Expected contents include:

- Posts
- Pages
- Tags
- Staff users
- Publication settings
- Some metadata

Suggested filename:

```text
ghost-content.json
```

## 2. Members Export

In Ghost Admin:

```text
Members
→ Settings
→ Export all members
```

Download the CSV file.

Expected fields may include:

- Email address
- Name
- Labels
- Subscription status
- Complimentary status
- Stripe customer ID
- Notes
- Created date
- Member metadata

Suggested filename:

```text
ghost-members.csv
```

## 3. Theme Export

Download the currently active Ghost theme.

Typical location:

```text
Settings
→ Design
→ Change theme
→ Installed themes
→ Download
```

Suggested filename:

```text
ghost-theme.zip
```

The theme will be used as:

- A design reference
- A source for CSS and visual styles
- A source for Handlebars templates
- A reference for layouts and navigation
- A source for custom scripts

The Ghost theme will not run directly in Next.js.

## 4. Analytics Export

Export any available Ghost post or member analytics.

Suggested filename:

```text
ghost-analytics.csv
```

Historical analytics may not import directly into Payload but should still be retained for reference.

## 5. Routes File

Download:

```text
routes.yaml
```

This file may define:

- Custom collections
- URL structures
- Taxonomies
- Channel pages
- Custom templates

The Next.js routing structure should be compared against this file.

## 6. Redirects File

Download the existing redirects file.

Possible filenames:

```text
redirects.yaml
redirects.json
```

All valid redirects should be carried into the new application.

## 7. Complete Media Archive

The standard Ghost JSON export does not include the physical image and media files.

For Ghost(Pro), contact Ghost support and request a complete site archive containing:

- Images
- Uploaded files
- Video
- Audio
- Themes
- Routes
- Redirects
- Content
- Other publication assets

Suggested request:

```text
Hi Ghost Support,

I am migrating my publication from Ghost(Pro) to a self-hosted
Next.js and Payload CMS website.

Please provide a complete site archive containing all content,
original images, uploaded files, media, themes, routes, redirects,
and other publication files.

I have not cancelled my Ghost(Pro) subscription.

Thank you.
```

This request must be made before cancelling Ghost.

## 8. Self-Hosted Ghost Backup

For a Ghost CLI installation, run:

```bash
cd /var/www/ghost
ghost backup
```

For a Docker installation, back up:

- The MySQL database
- The Ghost content volume
- Environment variables
- Docker Compose configuration
- Uploaded images and files

A full database backup should be retained even when the JSON export is available.

---

# Recommended Export Folder

Store all exports in one protected folder:

```text
ghost-export/
├── ghost-content.json
├── ghost-members.csv
├── ghost-analytics.csv
├── ghost-theme.zip
├── routes.yaml
├── redirects.yaml
├── complete-site-archive.zip
├── screenshots/
├── dns-records.txt
├── integrations.md
└── notes.md
```

Do not commit member exports, database backups, private configuration, or API keys to a public Git repository.

---

# Additional Information to Save Manually

Some Ghost settings may not be fully preserved in exports.

Document the following manually:

## Site Information

- Current production domain
- Ghost admin URL
- Site title
- Site description
- Site logo
- Publication icon
- Cover image
- Default social image
- Time zone
- Locale
- Publication language

## URL Structure

Document examples of:

- Homepage
- Post URL
- Page URL
- Tag URL
- Author URL
- Collection URL
- RSS URL
- Sitemap URL

Examples:

```text
/
/example-post/
/about/
/tag/example/
/author/example/
/rss/
/sitemap.xml
```

## Navigation

Record:

- Primary navigation
- Secondary navigation
- Footer navigation
- External navigation links

## SEO

Record:

- Default metadata
- Custom post metadata
- Canonical URLs
- Open Graph settings
- Twitter card settings
- Structured data
- Robots directives
- Existing redirects

## Integrations

Record all third-party services:

- Google Analytics
- Google Tag Manager
- Google Search Console
- Meta Pixel
- Email provider
- Stripe
- Zapier
- Make
- Webhooks
- Comments
- Search
- Forms
- Affiliate tracking
- Advertising scripts
- Cookie consent system

## Code Injection

Copy and save:

- Site header code injection
- Site footer code injection
- Post-level code injection
- Page-level code injection

## DNS

Export or document all existing DNS records before making changes.

Include:

- A records
- AAAA records
- CNAME records
- MX records
- TXT records
- SPF
- DKIM
- DMARC
- Verification records

---

# Proposed Payload Data Model

## Users Collection

Purpose:

- Payload administrator accounts
- Editors
- Authors

Suggested fields:

```text
name
email
password
role
profileImage
bio
website
socialLinks
ghostID
```

Suggested roles:

```text
admin
editor
author
```

## Authors Collection

An Authors collection may be separate from Users when public author profiles should not be directly tied to admin accounts.

Suggested fields:

```text
name
slug
bio
profileImage
website
socialLinks
ghostID
```

## Posts Collection

Suggested fields:

```text
title
slug
status
publishedAt
updatedAt
authors
tags
featuredImage
excerpt
content
legacyHTML
metaTitle
metaDescription
canonicalURL
openGraphImage
featured
visibility
ghostID
ghostURL
migrationStatus
```

Suggested statuses:

```text
draft
published
scheduled
archived
```

`legacyHTML` should initially retain the Ghost-rendered HTML.

This reduces the risk of breaking:

- Ghost cards
- Galleries
- Embeds
- Captions
- Custom HTML
- Bookmarks
- Callouts
- Buttons
- Audio cards
- Video cards
- Product cards

New articles can use Payload’s Lexical rich-text editor.

## Pages Collection

Suggested fields:

```text
title
slug
status
publishedAt
content
legacyHTML
featuredImage
metaTitle
metaDescription
canonicalURL
ghostID
```

## Tags Collection

Suggested fields:

```text
name
slug
description
featuredImage
metaTitle
metaDescription
ghostID
```

Support:

- Public tags
- Internal tags
- Ghost-style internal tags beginning with `#`

## Media Collection

Suggested fields:

```text
filename
alt
caption
credit
sourceURL
ghostURL
mimeType
width
height
migrationStatus
```

Media files should be uploaded to Cloudflare R2.

## Redirects Collection

Suggested fields:

```text
source
destination
statusCode
enabled
notes
```

Most permanent URL changes should use status code:

```text
301
```

## Subscribers Collection

Only create this collection if member records must be managed inside Payload.

Suggested fields:

```text
email
name
labels
status
complimentary
stripeCustomerID
createdAt
ghostID
consentSource
```

Sensitive member data must be protected with strict access controls.

## Globals

Recommended Payload globals:

- Site Settings
- Header
- Footer
- Navigation
- Homepage
- SEO Defaults
- Social Links
- Newsletter Settings

## Future Shared Content Collections

These collections should be introduced only when their related website or app features are scheduled. They do not all need to exist during the Ghost migration.

Suggested editorial and art entities:

```text
Artworks
Artists
Topics
Series
Exhibitions
Pigments
Palettes
Material Guides
Creative Prompts
Exercises
Audio Essays
Soundscapes
```

Suggested account and engagement entities:

```text
Members
Bookmarks
Highlights
Private Notes
Reading History
Saved Palettes
Device Tokens
Notification Preferences
App Entitlements
User Projects
Project Sync Manifests
Player Unlocks
```

Separate administrative users from public members. A recommended structure is:

```text
Admins    -> Payload administrators, editors, and authors
Members   -> Website and mobile app accounts
```

Normal members must never receive Payload Admin access. All user-owned documents must use strict ownership checks and field-level restrictions.

## Reusable Content Blocks

New editorial content should eventually support modular blocks that can render appropriately on web and mobile:

```text
Hero
Rich Text
Artwork Gallery
Color Palette
Pull Quote
Audio Player
Pigment Card
Material Comparison
Interactive Exercise
Recommended Reading
Related App Activity
Product Recommendation
```

The Ghost migration should still preserve `legacyHTML` first. Existing content should not be force-converted into modular blocks when doing so risks information loss.

---

# Content Migration Strategy

## Core Principle

Preserve the original Ghost content first. Convert content into a new editor format only when it can be done without information loss.

## Migration Script

Create a TypeScript migration script.

Suggested location:

```text
scripts/migrate-ghost.ts
```

The script should:

1. Parse the Ghost JSON export.
2. Identify the Ghost export version.
3. Create or map authors.
4. Create or map tags.
5. Import pages.
6. Import posts.
7. Preserve drafts.
8. Preserve publication dates.
9. Preserve updated dates when supported.
10. Preserve slugs.
11. Preserve excerpts.
12. Preserve feature status.
13. Preserve visibility.
14. Preserve SEO titles and descriptions.
15. Preserve canonical URLs.
16. Store the original Ghost ID.
17. Store the original Ghost URL.
18. Import featured images.
19. Find embedded media URLs inside HTML.
20. Download original media files.
21. Upload media to Cloudflare R2 through Payload.
22. Rewrite Ghost media URLs to the new media URLs.
23. Preserve image alt text and captions where possible.
24. Detect failed downloads.
25. Detect duplicate slugs.
26. Detect missing authors and tags.
27. Produce a migration report.
28. Support dry-run mode.
29. Be safe to rerun without creating duplicates.

Suggested commands:

```bash
pnpm migrate:ghost --dry-run
pnpm migrate:ghost
```

## Idempotency

The migration script should use `ghostID` as the external identifier.

When rerun, it should:

- Update existing records
- Avoid duplicate posts
- Avoid duplicate media
- Avoid duplicate tags
- Log conflicts

## Migration Report

Produce a report such as:

```text
migration-report.json
```

The report should include:

```text
postsImported
postsUpdated
pagesImported
tagsImported
authorsImported
mediaImported
mediaFailed
redirectsImported
membersImported
duplicateSlugs
brokenLinks
warnings
errors
```

---

# Media Migration

## Media Sources

Media may appear in:

- Featured image fields
- Post HTML
- Page HTML
- Author images
- Tag images
- Site logos
- Cover images
- Open Graph images
- Custom HTML blocks

## Required Behavior

The media migration should:

- Download the highest-quality available original file
- Retain filenames where practical
- Avoid duplicate uploads
- Calculate a checksum when possible
- Store the original Ghost URL
- Upload to Cloudflare R2
- Rewrite HTML references
- Preserve alt attributes
- Preserve width and height when available
- Log missing files

Do not hotlink production content to the old Ghost domain after migration.

---

# Frontend Requirements

## Required Pages

The initial Next.js site should support:

- Homepage
- Post page
- Page page
- Post archive
- Tag archive
- Author archive
- Search page
- RSS feed
- XML sitemap
- Robots.txt
- Custom 404 page
- Newsletter signup
- Privacy page
- Terms page, when applicable

## Rendering

Preferred:

- Server Components where appropriate
- Static generation for published content
- On-demand revalidation after Payload changes
- Dynamic rendering only when necessary

## Preview

Payload draft preview should allow editors to see unpublished changes in the Next.js frontend.

## Search

Initial search may use:

- PostgreSQL full-text search
- Payload queries
- A simple indexed search field

Avoid adding a separate search service until the site size requires it.

---

# SEO Migration Requirements

SEO preservation is a critical acceptance criterion.

## Preserve

- Post slugs
- Page slugs
- Tag slugs
- Author slugs
- Publication dates
- Updated dates
- Meta titles
- Meta descriptions
- Canonical URLs
- Open Graph images
- Twitter metadata
- Image alt text
- Structured data
- RSS feed
- Sitemap entries
- Robots behavior

## Redirects

Any changed URL must receive a redirect.

Preferred:

```text
301 Moved Permanently
```

Redirect logic may be implemented through:

- Next.js configuration
- Middleware
- Payload Redirects collection
- Caddy rules

A Payload Redirects collection is preferable when redirects need to be editable through the CMS.

## Structured Data

Post pages should provide appropriate JSON-LD, such as:

```text
Article
BlogPosting
NewsArticle
```

The chosen type should match the actual publication.

Include:

- Headline
- Description
- Image
- Author
- Publisher
- Date published
- Date modified
- Canonical URL

## Crawl Comparison

Before changing DNS:

1. Crawl the existing Ghost website.
2. Save all indexable URLs.
3. Crawl the staging Next.js website.
4. Compare status codes.
5. Compare titles.
6. Compare canonical URLs.
7. Compare meta descriptions.
8. Compare headings.
9. Compare structured data.
10. Check images.
11. Check internal links.
12. Verify redirects.
13. Identify unexpected 404 errors.

---

# Members and Paid Subscriptions

Payload is not a direct replacement for all Ghost membership functionality.

Ghost may currently provide:

- Member authentication
- Free subscriptions
- Paid subscriptions
- Stripe integration
- Newsletter delivery
- Member segmentation
- Email analytics
- Member portal
- Protected content

These features should not be rebuilt automatically unless currently required.

## Recommended Phases

### Phase 1

Migrate:

- Website
- Posts
- Pages
- Tags
- Authors
- Media
- SEO
- Redirects
- Basic newsletter signup

### Phase 2

Add:

- Newsletter sending
- Listmonk or another newsletter platform
- Subscriber synchronization
- Email preferences
- Unsubscribe handling

### Phase 3

Add only when needed:

- Paid memberships
- Stripe Checkout
- Customer portal
- Protected articles
- Member authentication
- Subscription webhooks
- Entitlement management

## Important Stripe Note

Do not create new Stripe customers unnecessarily.

Where existing paid members exist, preserve:

- Stripe customer ID
- Subscription ID when available
- Subscription status
- Product and price IDs
- Current period end
- Cancellation status

A separate Stripe migration plan may be required.

---

# Deployment Structure

Suggested repository structure:

```text
app/
├── (frontend)/
├── (payload)/
├── api/
└── admin/

collections/
├── Users.ts
├── Authors.ts
├── Posts.ts
├── Pages.ts
├── Tags.ts
├── Media.ts
├── Redirects.ts
└── Subscribers.ts

globals/
├── SiteSettings.ts
├── Header.ts
├── Footer.ts
├── Homepage.ts
└── SEO.ts

components/
lib/
scripts/
├── migrate-ghost.ts
├── migrate-media.ts
├── validate-migration.ts
└── backup-database.ts

docker/
Dockerfile
docker-compose.yml
Caddyfile
payload.config.ts
next.config.ts
```

When mobile development begins, evolve toward a pnpm workspace managed with Turborepo:

```text
beyond-every-art/
├── apps/
│   ├── web/                 Next.js + Payload website and admin
│   ├── dapple/              Expo app for iOS and Android
│   ├── morrow/              Expo app for iOS and Android
│   └── echo-garden/         Expo prototype for iOS and Android
├── packages/
│   ├── api-client/          Typed authenticated Payload client
│   ├── payload-types/       Generated Payload TypeScript types
│   ├── auth/                Shared session and account logic
│   ├── entitlements/        Store and subscription domain logic
│   ├── design-tokens/       Colors, type scales, spacing, and motion
│   ├── mobile-ui/           Selectively shared React Native components
│   ├── drawing-core/        Shared canvas models and utilities where useful
│   ├── analytics/           Shared event definitions
│   ├── validation/          Shared schemas
│   ├── eslint-config/       Shared lint configuration
│   └── typescript-config/   Shared TypeScript configuration
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

Each Expo application must keep its own `app.config.ts` or `app.json`, `eas.json`, credentials configuration, environment variables, native identifiers, and release pipeline inside its application directory.

The monorepo does not mean the apps are released together. Dapple, Morrow, Echo Garden, and the website must remain independently buildable and deployable. Changes to a shared package should trigger only the affected tests and builds.

Keep compatible versions of React, React Native, Expo modules, Payload packages, and native dependencies across the workspace. Duplicate or incompatible native-module versions can cause installation, runtime, and EAS build failures.

Do not force the initial Ghost migration into the full monorepo if doing so threatens the website cutover. It is acceptable to begin with `apps/web` and add the Expo applications after production stability. However, if mobile implementation is beginning immediately, adopting the final workspace structure early will reduce a later repository migration.

If Echo Garden moves to Unity or Godot, split it into a separate repository:

```text
beyond-every-art/          Website, Dapple, Morrow, and shared TypeScript packages
echo-garden-game/          Unity or Godot game project
```

The game can continue to consume the same Payload APIs without remaining in the JavaScript workspace.

## Docker Services

Suggested services:

```text
app
postgres
caddy
```

Optional services:

```text
listmonk
redis
backup
```

Redis is not required for the initial version unless caching, queues, or rate limiting specifically require it.

---

# Environment Variables

Expected variables may include:

```text
DATABASE_URI
PAYLOAD_SECRET
NEXT_PUBLIC_SERVER_URL
PAYLOAD_PUBLIC_SERVER_URL

S3_ENDPOINT
S3_REGION
S3_BUCKET
S3_ACCESS_KEY_ID
S3_SECRET_ACCESS_KEY
S3_PUBLIC_URL

RESEND_API_KEY
EMAIL_FROM_ADDRESS
EMAIL_FROM_NAME

NEXT_PUBLIC_GA_ID
NEXT_PUBLIC_SITE_URL

GHOST_EXPORT_PATH
GHOST_MEDIA_PATH
```

Never commit production secrets.

Provide:

```text
.env.example
```

with placeholder values only.

---

# Staging and Launch Process

## Staging

Deploy the new site to a staging domain, for example:

```text
staging.example.com
```

The staging site should be:

- Protected from indexing
- Password protected when possible
- Connected to a staging database
- Used for migration testing

## Migration Rehearsal

Before launch:

1. Import a copy of the Ghost export.
2. Validate posts and pages.
3. Validate media.
4. Compare URLs.
5. Test redirects.
6. Test the Payload admin.
7. Test draft previews.
8. Test forms.
9. Test email delivery.
10. Test backups.
11. Restore a backup in a test environment.
12. Record all migration problems.

## Final Cutover

1. Reduce DNS TTL in advance.
2. Freeze publishing temporarily.
3. Create a final Ghost export.
4. Obtain the latest members export.
5. Download any media added since the rehearsal.
6. Run the final migration.
7. Validate content counts.
8. Validate recent posts.
9. Validate homepage content.
10. Validate media.
11. Validate redirects.
12. Validate sitemap and RSS.
13. Validate analytics.
14. Change DNS to the new server.
15. Monitor logs and errors.
16. Keep Ghost active as a fallback.
17. Do not cancel Ghost immediately.

## Post-Launch Monitoring

Monitor:

- 404 errors
- 500 errors
- Missing images
- Broken links
- Search Console coverage
- Sitemap processing
- Canonical URL issues
- Analytics traffic
- Form submissions
- Email delivery
- Database storage
- R2 usage
- CPU and memory
- Backup completion

---

# Acceptance Criteria

The migration should not be considered complete until:

- All expected posts are present.
- All expected pages are present.
- All expected tags are present.
- Authors are correctly mapped.
- Featured images are present.
- Embedded media loads from the new infrastructure.
- Original publication dates are retained.
- Drafts remain drafts.
- Original slugs are retained.
- Existing URLs return the correct page or a valid redirect.
- No important indexed URL returns an unexpected 404.
- SEO titles and descriptions are retained.
- Canonical URLs are correct.
- RSS works.
- Sitemap works.
- Robots.txt works.
- Payload admin works.
- Draft preview works.
- Database backups run successfully.
- A database backup has been successfully restored.
- Ghost remains available until the migration is verified.
- Sensitive exports are not exposed publicly.
- The schema does not block future authenticated mobile API access.
- Administrative users and public members can be separated cleanly.
- Media storage and content ownership rules are suitable for future app distribution.

Future apps have their own acceptance criteria and are not required for the Ghost migration to be considered complete.

---

# Risks

## Content Conversion Risk

Ghost content may contain custom cards or HTML that does not map cleanly to Payload Lexical.

Mitigation:

- Preserve original rendered HTML.
- Use `legacyHTML`.
- Convert content gradually.
- Manually review complex posts.

## Media Loss Risk

Ghost JSON does not include physical media files.

Mitigation:

- Request a full Ghost archive.
- Download media before cancellation.
- Crawl the site for media URLs.
- Verify all media after import.

## SEO Loss Risk

Changing URL structures can reduce organic traffic.

Mitigation:

- Preserve slugs.
- Import redirects.
- Crawl old and new sites.
- Monitor Search Console.
- Keep canonical URLs correct.

## Membership Risk

Ghost memberships and newsletters are tightly integrated.

Mitigation:

- Export members.
- Retain Stripe identifiers.
- Separate website migration from membership rebuilding.
- Do not cancel active subscriptions without a migration plan.

## Infrastructure Risk

Self-hosting introduces server maintenance responsibilities.

Mitigation:

- Use Docker Compose.
- Automate backups.
- Use Cloudflare.
- Document deployments.
- Apply security updates.
- Keep the architecture simple.

---

# Immediate Next Actions

1. Export Ghost content and settings JSON.
2. Export members CSV.
3. Download the active Ghost theme.
4. Export analytics.
5. Download routes and redirects.
6. Request a complete archive from Ghost support.
7. Save custom code injection.
8. Save navigation and site settings.
9. Document current integrations.
10. Export DNS records.
11. Crawl the existing site and save all URLs.
12. Create the Next.js and Payload repository.
13. Configure Payload with PostgreSQL.
14. Configure Cloudflare R2.
15. Define collections and globals.
16. Build the Ghost migration script.
17. Run a staging migration.
18. Validate content and SEO.
19. Perform final cutover.
20. After the website is stable, confirm whether a separate Beyond Every Art companion app remains in scope or whether the website will cover that role initially.
21. Initialize the pnpm and Turborepo workspace before active development of the three mobile apps.
22. Create separate Expo and EAS configurations for Dapple, Morrow, and Echo Garden on iOS and Android.
23. Prototype the shared member, bookmark, palette, entitlement, API-client, and design-token packages.
24. Establish the platform UI strategy: native Liquid Glass controls on supported iOS versions and a branded Android-specific translucent system.
25. Prepare a separate product requirements document and drawing-performance prototype for Dapple.
26. Validate the Morrow privacy, encryption, local-storage, and sync architecture before implementation.
27. Build a small Echo Garden art-and-sound vertical slice in Expo before deciding whether the full product needs Unity or Godot.
28. Cancel Ghost only after successful verification.

---

# Files Needed From the Website Owner

The developer or migration agent will need:

```text
ghost-content.json
ghost-members.csv
ghost-theme.zip
ghost-analytics.csv
routes.yaml
redirects.yaml
complete-site-archive.zip
```

Also required:

- Current production domain
- Access to the domain DNS
- Access to Cloudflare
- Access to the chosen VPS provider
- GitHub repository access
- Ghost Admin access during migration
- Google Analytics access
- Google Search Console access
- Stripe access when paid subscriptions exist
- Email provider access
- List of third-party integrations

---

# Implementation Priority

## Priority 1: Data Safety

- Complete exports
- Media archive
- Backups
- Member data protection

## Priority 2: Migration Accuracy

- Posts
- Pages
- Authors
- Tags
- Dates
- Slugs
- Media
- SEO

## Priority 3: Stable Infrastructure

- PostgreSQL
- Payload
- Next.js
- R2
- HTTPS
- Backups

## Priority 4: Visual Parity

- Rebuild the current Ghost design
- Responsive behavior
- Navigation
- Typography
- Article layouts

## Priority 5: Website Enhancements

- Redesign
- Apply the recorded [Next.js + Payload website visual direction](WEBSITE_VISUAL_DIRECTION.md)
  as a post-parity design brief
- Improved search
- Newsletter system
- Memberships
- Paid content
- Additional animations
- New content components

## Priority 6: App Platform and Product Development

- Shared member authentication
- Mobile API design
- Bookmarks, palettes, projects, and entitlements
- Beyond Every Art companion app
- Dapple MVP
- Morrow privacy and synchronization prototype
- Echo Garden vertical slice

App development begins only after the migration, backups, SEO, and production website are stable.

---

# Final Instruction to the Implementing Developer or Agent

Do not begin by redesigning the website.

First create a stable migration path that preserves the existing Ghost content, URLs, media, and SEO. Build the Payload schema and migration tooling before making major visual changes.

Keep Ghost online until:

- The final import is complete.
- The new site has been crawled.
- Redirects have been validated.
- Media has been verified.
- Backups have been tested.
- The new production site has operated successfully.

The migration should be repeatable, logged, and safe to rerun.
