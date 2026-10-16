# Companion App

The Beyond Every Art companion app: a native iOS and Android reading and
discovery app built on the same Payload content as the website. This document
records the decision that let it start, what that decision does not cover, and
— as the work lands — how the app is laid out, what it reads, and what is left
for the owner to decide.

## The decision

> **Owner decision, 16 Oct 2026:** the Beyond Every Art companion app is in
> scope, and scaffolding may begin now. This lifts the app gate for scaffolding
> only. Reader accounts, sign-in, purchases, push, server-side bookmarks, store
> records and any new Payload collection or field stay gated.

Dated by the owner on 16 Oct 2026, when asked in the session that scaffolded
the app. The brief that commissioned the work carried this decision with its
date left blank, and a decision nobody dated is not one this repository
records.

It answers two things the handoff left open, for scaffolding only:

- Next Action 20 in
  [`GHOST_TO_PAYLOAD_HANDOFF_WITH_APP_STRATEGY.md`](GHOST_TO_PAYLOAD_HANDOFF_WITH_APP_STRATEGY.md)
  — whether a separate companion app remains in scope or the website covers
  that role. It is in scope.
- Priority 6's gate in the same document: "App development begins only after
  the migration, backups, SEO, and production website are stable." Lifted for
  scaffolding, the way the publication system's gate was lifted on 3 Oct 2026
  ([`PUBLICATION_SYSTEM.md`](PUBLICATION_SYSTEM.md), decision 0).

### What scaffolding means here

- An app that builds, is tested against the real content contract, and reads
  articles offline.
- The server endpoint it will eventually read from, built and switched off.

It does not mean a store-ready product.

### What stays gated

Each of these needs its own dated owner decision before any code is written:

- reader accounts and sign-in;
- purchases, subscriptions and store billing;
- push notifications;
- server-side bookmarks, reading history or device tokens;
- App Store and Play Store records, bundle registrations and EAS projects;
- any new Payload collection or field.

### What it must not displace

The open post-cutover items in
[`DEPLOYMENT_STATUS.md`](DEPLOYMENT_STATUS.md) come first, as they do for the
publication system ([`AUTONOMOUS_WORKSTREAMS.md`](AUTONOMOUS_WORKSTREAMS.md)).
The scaffold adds no load to production and changes nothing a reader of the
website sees.
