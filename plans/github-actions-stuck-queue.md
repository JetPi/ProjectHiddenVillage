# GitHub Actions Stuck Queue — Runbook and Fix

Symptom: a run sits in `Queued`, or it is stuck showing **Cancelling...** and never reaches
`Cancelled`. The Actions tab keeps the run spinning for hours, new pushes run on top of it, and the
queue grows.

Cause: the cancellation is a *request* to GitHub's Actions orchestrator. The web UI waits for the
orchestrator to acknowledge it before it changes the badge. When the orchestrator lags, there is
nobody left to ack the request, so the run stays exactly where it was and the button appears dead.
Nothing in this repository can make the orchestrator faster; what it can do is (a) stop feeding the
queue and (b) give you a way to clear it without the web UI.

## 1. Clear the queue now (the wedged run in front of you)

[`scripts/gh-actions-force-cancel.sh`](../scripts/gh-actions-force-cancel.sh) talks to the REST API
directly. `curl` and `node` are already on the box; `gh` is not, and does not need to be.

```bash
export GH_TOKEN=<classic PAT or fine-grained token with Actions: write>
# optional: the script reads owner/repo from the origin remote

./scripts/gh-actions-force-cancel.sh --dry-run            # what is actually queued/in progress
./scripts/gh-actions-force-cancel.sh 163                  # one run id
./scripts/gh-actions-force-cancel.sh --workflow e2e.yml    # everything of one workflow
./scripts/gh-actions-force-cancel.sh                       # every queued/in-progress run
```

It calls `POST /repos/{owner}/{repo}/actions/runs/{id}/force-cancel`, the endpoint GitHub documents
for runs that will not accept a normal cancel, and falls back to `POST .../cancel` if force-cancel is
not accepted. Every response is printed with its HTTP code, so a refusal is visible instead of silent.

If even that is refused, drop the whole queue for that workflow — disabling a workflow deletes
everything it has queued, and re-enabling it makes it runnable again:

```bash
./scripts/gh-actions-force-cancel.sh --wedged e2e.yml
```

That is the same disable → wait → enable cycle as the Actions UI's `...` menu, without the clicking.
Do not use it while a run you want to keep is in flight: it kills queued *and* in-progress runs of
that file.

With `gh` installed, the equivalents are `gh run cancel <id>`, `gh workflow disable e2e.yml`,
`gh workflow enable e2e.yml`.

## 2. Why it kept happening (what changed in the repo)

| File | Before | After | Why |
|---|---|---|---|
| [`.github/workflows/publish-images.yml`](../.github/workflows/publish-images.yml) | no `concurrency`, no job timeout (default **360 min**) | `concurrency: <workflow>-<ref>`, `cancel-in-progress: true`, `timeout-minutes: 30` on both jobs | Every push to `main` added an api+web pair to the queue. These are the two slowest jobs in the repo, they keep docker layer caches busy, and a wedged build looked exactly like a permanently queued workflow for six hours. |
| [`.github/workflows/e2e.yml`](../.github/workflows/e2e.yml) | `concurrency` group with a stray `e2e-` prefix | same group, documented | It already had the right protection; the comment records why, so it does not get removed as noise. `github.ref` is `refs/pull/<n>/merge` on `pull_request`, so each PR cancels only its own run. |
| [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) | `concurrency: deploy`, `cancel-in-progress: false`, 30 min timeout | unchanged | Deliberate. A deploy drains live games; cancelling one halfway would leave the site in maintenance mode. |

The one trade-off: `cancel-in-progress` on `publish-images` means a superseded push publishes no
image for its sha. Re-run that run (Actions → the run → **Re-run jobs**) if you ever need to deploy
the older commit instead of the newest one.

There is no push-triggered blank commit in this runbook on purpose. Pushing only to refresh a
concurrency group adds a commit nobody wants in the history, and the rule is already in the files.

## 3. Guard rails that keep the queue short

- Every job has a `timeout-minutes`. A hung step then fails on its own instead of holding a queued
  slot for the 360-minute default.
- `playwright` keeps `fail-fast: false` on purpose (see [`e2e.yml`](../.github/workflows/e2e.yml)):
  the per-shard reports are how a failure is classified as shard-specific or global.
- `concurrency` groups are keyed on `${{ github.ref }}`, so a PR and a `main` push never cancel each
  other.

## 4. If it happens again

1. `./scripts/gh-actions-force-cancel.sh --dry-run` — confirm the stale run ids.
2. `./scripts/gh-actions-force-cancel.sh --workflow <file>.yml`.
3. Still queued after ~2 minutes → `--wedged <file>.yml`.
4. Still stuck after that, the run is on GitHub's side; report it at
   <https://www.githubstatus.com/> and note the run id — no repository change fixes an orchestrator
   outage.
