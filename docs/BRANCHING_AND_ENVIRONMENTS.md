# Branching and Environments

How work reaches the live site, and where a change can be seen before it does.

The shape below is not a preference. It is the shape the existing deploy path
already has: `.github/workflows/ci.yml` deploys the exact commit its four build
jobs tested, and the VPS half of that job refuses any deploy that is not a
fast-forward from what is currently running. A branching model that asks the
deploy to move sideways or backwards fights a guard that exists for a good
reason, so the model here moves in one direction only.

## The shape

- **`main` is the trunk.** Every pull request merges here, and a merge deploys
  to the **staging** environment automatically. This is the "test branch" — it
  is just called `main`, and see below for why that is the right answer rather
  than a technicality.
- **`production` is a pointer, not a place to work.** It only ever
  fast-forwards to a commit that is already on `main` and already green. A push
  to it deploys the live site. Nothing is ever committed to it directly, and it
  never merges back into anything.
- **Feature branches are short-lived**, cut from `main`, one pull request each,
  deleted on merge.

Promotion is one command, run when staging has been watched for long enough to
trust:

```bash
git checkout production
git merge --ff-only main    # fails loudly if production has drifted
git push origin production
```

`--ff-only` is the whole discipline. If it ever refuses, something was
committed to `production` that is not on `main`, and that is a bug to
investigate rather than a merge to force.

Two questions get straight answers under this model, which is most of its
value:

```bash
git log --oneline production..main   # on staging, not yet live
git log --oneline -1 production      # exactly what is live
```

## Why not a long-lived `test` branch

The obvious alternative — `main` is production, `test` is where things go
first — is the one to avoid here, for three reasons specific to this
repository.

It merges backwards. Work lands on `test`, gets promoted to `main`, and then
`main` has to be merged back into `test` or the two diverge. Every hotfix has to
land twice, and the second landing is the one that gets forgotten. The failure
is silent: `test` slowly stops resembling what is live, so the environment that
exists to catch problems stops being able to.

It fights the deploy guard. The VPS refuses a non-fast-forward deploy, and a
branch that receives merges from two directions produces exactly the history
where "is this commit a descendant of what is running" stops having a useful
answer.

And it does not survive the way this repository actually gets worked on. There
are thirty-five branches on the remote and twenty-nine of them are unmerged,
most opened by agents. A model whose correctness depends on merging in the
right direction every time will not hold up under that; a model where the only
promotion operation is `--ff-only` will, because the wrong thing cannot be done
quietly.

There is still a use for a branch named `test`, but not in the promotion path:
a scratch branch that anyone may force-push to preview a work in progress,
deploying nowhere. Keep it outside this model entirely if you want it.

## Rollback is forward-only

This is the honest cost of the model, and it is worth stating plainly rather
than discovering during an incident.

The deploy refuses to move the VPS backwards. So the way to undo a bad release
is to revert it on `main` and promote the revert:

```bash
git checkout main && git revert <bad-sha> && git push origin main
# wait for staging + CI, then
git checkout production && git merge --ff-only main && git push origin production
```

That is a full CI cycle — call it twenty-five minutes to a fix being live. When
that is too slow, the escape hatch is an operator on the box, not the workflow:
`git reset --hard <good-sha>` in the deploy directory followed by
`docker compose up -d --build`, after which `main` must be reverted anyway so
the next deploy does not simply reapply the bad commit.

If twenty-five minutes is judged too slow to accept, the fix is a
`workflow_dispatch` entry point on the deploy job taking an explicit SHA and
skipping the ancestry check — a deliberate, logged, hard-to-do-by-accident
rollback. That is a change to make on purpose, not a guard to weaken generally.

**Schema migrations do not roll back with the code.** Migrations are
forward-only and committed
(see [`DATABASE_MIGRATIONS.md`](DATABASE_MIGRATIONS.md)), so reverting a pull
request reverts its code and leaves its schema change applied. Usually that is
harmless — an unused column. It is not harmless when the migration dropped or
rewrote something. Two rules follow:

- Schema changes are expand-then-contract. Add the new column, ship the code
  that writes both, promote, let it run, and only then drop the old one in a
  later change. Each half is independently revertible; the combined version is
  not.
- A promotion carrying a destructive migration gets a backup first
  (`pnpm backup:db`) and a manual approval gate. The deploy already runs
  migrations to completion before replacing any container, so a failed
  migration leaves the previous release serving an unchanged database — that
  protects against a migration that fails, not against one that succeeds and
  was wrong.

## Sequencing this around cutover

Right now there is one VPS running one Compose stack, serving
`staging.beyondeveryart.com` behind `NEXT_PUBLIC_NOINDEX` and
`STAGING_BASIC_AUTH`, deployed from `main`. There is nowhere for a second
environment to live yet, so the model above arrives in three steps rather than
one.

**Now, before cutover.** Nothing about the branch topology changes — `main`
still deploys to the box, which is still staging. Do only the preparation that
is safe while that is true: parameterize the deploy job by environment, put
branch protection on `main`, and make the Compose host port bindings
configurable so a second stack can exist. None of that alters where anything
deploys today.

**At cutover.** The box becomes production; the apex domain points at it and
the staging gates come off, per [`CUTOVER_RUNBOOK.md`](CUTOVER_RUNBOOK.md).
In the same change, the branch mapping flips: create `production` at the
cutover commit, point the deploy job at `production`, and stop `main` from
deploying. The mapping flip and the cutover are one operation — a window where
`main` still auto-deploys to a box that is now live is the thing this whole
document exists to prevent.

Between that point and the next step, `main` deploys nowhere. CI still runs on
every pull request, so nothing is lost but the preview, and that is a safe
place to sit for a few days while the live site is watched.

**After the live site is stable.** Stand up the second stack and point `main`
at it. Do this once production has been quiet for several days; a fresh
environment competing for the same VPS during the week of cutover is a
self-inflicted incident.

## Standing up the staging stack

The second stack can share the VPS, but not naively — three things collide.

- **Host ports.** `docker-compose.yml` binds `127.0.0.1:5432` and
  `127.0.0.1:3000` on the host, and Caddy binds `80` and `443`. Two stacks
  cannot both have those. Make the first two variables with today's values as
  defaults, and give the staging stack `5433` and `3001`.
- **Caddy.** Only one instance can hold `:443`. Run the staging stack without
  it (a Compose profile, as `migrate` already does), put both app containers on
  a shared external Docker network, and let the production Caddy serve
  `staging.beyondeveryart.com` by proxying to the staging app. The DNS record
  and certificate for that name already exist and already point at this VPS, so
  this costs nothing new.
- **Volume and project names.** `COMPOSE_PROJECT_NAME=bea-staging` in the
  staging directory's `.env` prefixes its volumes, which keeps its database and
  its uploads genuinely separate. Getting this wrong is not a conflict error;
  it is two applications sharing one database.

Then the staging stack's own `.env`:

- `NEXT_PUBLIC_NOINDEX=1` and `STAGING_BASIC_AUTH` **stay set**. They come off
  the production stack at cutover and must never come off this one.
- Its own `CMS_ADDRESS` — `cms-staging.beyondeveryart.com`, needing a DNS
  record. `cms.beyondeveryart.com` follows production.
- Its own `PAYLOAD_SECRET`. Sharing one across environments means a staging
  session cookie is valid in production.
- **No backup service**, or at minimum a distinct R2 prefix. The backup job
  prunes to a retention count, so a staging stack pointed at production's
  prefix will delete production's backups on a schedule and report success.
- Stripe: leave the keys unset. `STAGING_BASIC_AUTH` does not gate
  `/webhooks/stripe` — the middleware matcher excludes it — so a live endpoint
  pointed here lands real billing events in the staging database. See the
  warning in [`CUTOVER_RUNBOOK.md`](CUTOVER_RUNBOOK.md).

Check `free -m` before committing to one box. Two PostgreSQL instances and two
Next.js applications on a small VPS is the plausible failure here, and the
memory ceilings in `docker-compose.yml` cap containers rather than reserving
memory, so the total may exceed RAM. A second cheap VPS is the alternative if
it does not fit; nothing above assumes one host except the Caddy arrangement.

### Refreshing staging from production

Staging is worth having only if its data resembles production's. Refresh it
from a backup — and take the media with it. Uploads live on a local disk volume
rather than object storage, so a database restored without its files gives
every image a 500 and a broken-image icon, which this project has already been
bitten by once (see [`DEPLOYMENT_STATUS.md`](DEPLOYMENT_STATUS.md)).

Restore the database per [`BACKUP_AND_RESTORE.md`](BACKUP_AND_RESTORE.md) into
the staging stack, then copy the `media_data` volume across.

One caveat with teeth: production's database contains migrated Ghost member
records and Stripe identifiers. A staging environment sitting behind HTTP Basic
Auth is not a place for real member data. Either scrub the `members` and
`billing-events` collections after each refresh, or refresh from
`pnpm seed:dev` and accept that staging carries no real content.

## What has to change in CI

The deploy job hardcodes one environment. Concretely, in
`.github/workflows/ci.yml`:

- `on.push.branches` is `[main, work]`. There is no `work` branch — it is
  removed in the same change as this document. It becomes `[main, production]`.
- The `deploy` job's `if:` is pinned to `refs/heads/main`. It needs to run for
  both branches and choose its target from the ref.
- `concurrency.group` is the literal `production-deploy`. It must include the
  environment, or a staging deploy will serialize behind a production one.
- The remote script fetches and checks ancestry against `origin/main`
  specifically. It should use the branch being deployed. (A `production` that
  only fast-forwards from `main` satisfies both readings, which is exactly why
  the discrepancy would go unnoticed until it mattered.)
- `VPS_DEPLOY_PATH` differs per environment. GitHub Environments are the right
  mechanism: `staging` and `production` each holding their own value, with the
  production one carrying a required-reviewer gate so a promotion is a decision
  someone makes rather than a consequence of a merge.

A push to `production` re-runs the full suite against a tree that is byte-identical
to one that already passed on `main`. That is fifteen to twenty-five minutes
spent proving something already known, and it is worth paying: it is what makes
"green on `production`" a fact about the promotion rather than an inference.

## Branch protection

Neither branch is protected today (`DEPLOYMENT_STATUS.md`, item 5). Both need
it, and for different reasons.

On `main`: require `checks`, `browser-smoke`, `backup-image`, and `app-image`;
require a pull request; require branches to be up to date before merging.

On `production`: the same required checks, plus **require linear history** —
which is how GitHub expresses "no merge commits", the closest it comes to
enforcing fast-forward-only — and no direct pushes from anyone who is not
performing a promotion. The VPS ancestry guard is the real backstop, but a
guard that only fires at deploy time reports the problem after the merge has
already happened.

## Branch hygiene

Twenty-nine unmerged branches on the remote, most of them agent work that was
either landed by another route or abandoned. That is not a tidiness complaint:
it makes "is this work in `main`" a question requiring investigation, which is
the same question promotion depends on.

Turn on automatic branch deletion on merge in repository settings. Prune what
is already dead — `git branch -r --merged origin/main` lists the branches whose
commits are already in the trunk, and those are safe to delete outright. For
the rest, close the pull request or land it; a branch with no open pull request
and no commits in six weeks is finished whether or not anyone said so.

The naming already in use is fine and needs no scheme imposed on it:
`claude/*`, `codex/*`, and `agent/*` say who opened the work, which is the
useful fact. The rule that matters is not the prefix, it is that the branch is
short-lived and cut from `main`.
