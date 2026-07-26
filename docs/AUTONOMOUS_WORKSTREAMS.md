# Autonomous Workstreams

This document turns five low-input improvements into one sequenced delivery
program. It is an implementation framework, not permission to skip the Ghost
migration gates in [`AGENTS.md`](../AGENTS.md).

## Outcome

Make cutover evidence repeatable, catch user-visible regressions before deploy,
make production deployment safer, keep local and CI checks trustworthy, and
prepare the non-invasive routing foundation for the later publication system.

## Sequence and gates

| Order | Workstream                | Can ship before cutover?          | Completion evidence                                                                                                       |
| ----- | ------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1     | Migration site comparison | Yes; directly supports cutover    | Bounded source/target crawl, deterministic comparison, JSON and human reports, automated tests                            |
| 2     | Browser smoke tests       | Yes; directly supports cutover    | Seeded core journeys pass locally and in a dedicated CI job                                                               |
| 3     | Deployment safety         | Yes; directly supports operations | Deployments serialize, time out, clean credentials, and fail when the local app health check fails                        |
| 4     | Repository quality        | Yes                               | Clean checkouts and local agent worktrees produce the same scoped format/lint/test result; dependency updates are visible |
| 5     | Publication groundwork    | Only route/slug primitives        | Reserved route collisions appear during migration planning and Payload editing; path helpers are unit tested              |

Workstreams 1–4 may proceed in parallel because they own separate surfaces.
Workstream 5 is deliberately limited to primitives until the acceptance gates
in the handoff and cutover runbooks pass.

## Shared invariants

- Never commit Ghost exports, member CSVs, production URLs protected by
  credentials, database dumps, reports containing private data, or secrets.
- A comparison failure must be explainable from its saved report; a green
  aggregate without per-URL evidence is insufficient.
- Browser tests use synthetic seeded data and must not mutate production.
- Deployment success means the expected containers are running and the app's
  local `/health` endpoint reports readiness; an SSH command returning zero by
  itself is insufficient.
- New root routes must reserve their first path segment before launch. A
  migration collision is resolved explicitly with a replacement slug and a
  redirect, never silently rewritten.
- Publication collections, PDF processing, analytics, and reader UI remain
  out of scope until the migration is signed off.

## Integration ownership

Shared files require one final integration pass:

- `package.json` and `pnpm-lock.yaml`: merge CLI and browser scripts together.
- `.github/workflows/ci.yml`: combine deployment hardening with the browser job
  only after the browser command is stable.
- Test discovery and ignore rules: exclude tool-owned worktrees without
  excluding product tests.
- `README.md` and runbooks: link commands from their operational point of use;
  avoid duplicating detailed instructions in several documents.

## Verification ladder

1. Run focused unit tests for each pure library.
2. Run format, lint, typecheck, and all unit tests from a clean tracked tree.
3. Generate Payload types before typecheck when schemas changed.
4. Run the browser suite against a seeded PostgreSQL-backed application.
5. Validate `docker compose config` and workflow YAML.
6. Let the pull-request CI build both Docker images and run browser smoke tests.
7. Run the migration comparison against staging and retain the report as
   cutover evidence.

Steps 6–7 require external CI/staging state. They cannot be replaced by a
local unit-test result.

## Deferred operator decisions

These remain explicit human/operator actions rather than autonomous code
changes: DNS and TLS cutover, production secrets, members export, Stripe
endpoint creation, SSH account changes, branch-protection policy, and approval
to decommission Ghost.
