# Email

Who sends mail on behalf of this site, and who does not. Two jobs that look
like one and want opposite things from a provider.

## The split

|                  | Transactional                                 | Marketing                                   |
| ---------------- | --------------------------------------------- | ------------------------------------------- |
| What             | Password reset, address verification, sign-in | Newsletter, announcements, member campaigns |
| Triggered by     | One person, one action, expects it in seconds | An editor, to a segment, on a schedule      |
| Provider         | **None today** — see below                    | **Klaviyo**                                 |
| Carries a secret | Yes, a single-use token                       | No                                          |

## Marketing: Klaviyo

**Decided 18 Sep 2026.** Klaviyo is the email service provider for anything
list-shaped: the migrated Ghost member list, the `newsletter-signups`
collection, launch announcements, and whatever the account model grows into.
Build around it rather than evaluating alternatives again.

This replaces the handoff's earlier placeholder, which named Listmonk. Klaviyo
wins on the things that matter for a migrated list — segmentation, flows,
deliverability, and a sending reputation someone else maintains — and the
account and DNS already exist, which Listmonk would have meant standing up and
operating.

Nothing is built against it yet. `newsletter-signups` records rows and sends
nothing; the Ghost member list lives in `members` as a preservation copy. The
first integration will need a decision about which system owns subscription
state, and this document should carry the answer when it is made.

## Transactional: nothing, deliberately

**Decided 18 Sep 2026.** No transactional provider is configured, and that is
a choice rather than an oversight. `RESEND_API_KEY` and `EMAIL_FROM_ADDRESS`
are deliberately empty in production.

It is affordable because of how little mail this application actually sends.
`Users` is the only collection with `auth`. `collections/Members.ts` says in
its own description that it is a "Restricted preservation copy of Ghost member
data. Not an authentication collection." The passwordless member sign-in in
[`ACCOUNT_MODEL.md`](ACCOUNT_MODEL.md) is design, not code — there is no
accounts collection. The newsletter and app-waitlist server actions write rows
and send nothing. So the only mail the application would send is Payload's
**administrator** password reset and verification.

And an administrator lockout has a recovery path that does not need email:

```bash
docker compose run --rm migrate pnpm bootstrap:admin
```

with `PAYLOAD_BOOTSTRAP_EMAIL`, `PAYLOAD_BOOTSTRAP_NAME` and
`PAYLOAD_BOOTSTRAP_PASSWORD` set. The password must be at least 14 characters
and mix three of the four character classes; `validateBootstrapPassword` in
`scripts/bootstrap-admin.ts` enforces it.

**Anyone locking themselves out of Payload needs SSH to get back in.** That is
the whole cost of this decision, and it is acceptable while the administrators
are also the people with SSH. It stops being acceptable the moment either of
those stops being true.

### What makes this decision expire

Build any of these and a transactional provider becomes required, not optional:

- The account model's emailed sign-in link — every sign-in is a send.
- Member-facing password reset or address verification.
- Any receipt, dunning, or subscription notice.
- Administrators who do not have SSH access.

The adapter is already written and tested (`lib/email/resend.ts`,
`tests/email/resend.test.ts`), so turning it on is a key, a from-address, and
`docker compose up -d`. Neither variable is `NEXT_PUBLIC_*`, so neither reaches
the client bundle and no rebuild is needed.

### Do not use Klaviyo for this

It is the same word and a different problem, and the reasons are worth keeping
where the question will be asked again:

- **Shape.** Payload's adapter is `sendEmail({ to, subject, html, text })` —
  send this, now. Klaviyo has no equivalent endpoint. You post an event, a flow
  picks it up, a Klaviyo-hosted template renders. That is an events client and a
  flow to maintain, not a configuration change.
- **The token.** Payload generates the reset link, so the token would travel as
  an event property. That writes credential-equivalent material into a marketing
  platform, where it is retained on the profile, visible to everyone with
  Klaviyo access, and carried out in profile exports. `AGENTS.md` puts secrets
  on the ask-first side for less than this.
- **Timing.** Flows are queued. A password reset is judged in seconds.
- **Reputation.** One sending identity for both means a campaign's complaint
  rate degrades password-reset delivery, and vice versa.

## DNS

Each sender gets its own subdomain rather than an `include:` on the root.

A domain has exactly one SPF record, so a second sender added to the root
breaks both; and SPF permits ten DNS lookups total, which three `include:`
chains can exhaust on their own. Per-subdomain records sidestep both, and keep
each sender's reputation from being borrowed by the others.

Ghost still sends from this domain until it is decommissioned, which is the
reason this matters now rather than later. Klaviyo's records are already in the
Cloudflare zone; confirm they sit on a sending subdomain and not the apex before
adding anything else.
