#!/usr/bin/env bash
# Clears GitHub Actions runs that are wedged in the queue or stuck on "Cancelling...".
#
# The web UI only *requests* a cancellation and then waits for the Actions orchestrator to confirm
# it. When the orchestrator lags the confirmation never arrives, the button spins, and the run stays
# queued. The REST API takes the same path but returns immediately and says whether the request was
# accepted, so a refusal is visible instead of silent.
#
# Usage:
#   scripts/gh-actions-force-cancel.sh                      # cancel every queued/in-progress run
#   scripts/gh-actions-force-cancel.sh 163 164              # cancel specific run ids
#   scripts/gh-actions-force-cancel.sh --workflow e2e.yml   # only runs of one workflow
#   scripts/gh-actions-force-cancel.sh --wedged e2e.yml     # disable + enable: drops the whole queue
#   scripts/gh-actions-force-cancel.sh --graceful 163       # plain cancel, without force-cancel
#
# Options:
#   --repo owner/name   Defaults to the `origin` remote of the current git checkout.
#   --workflow NAME     Workflow file name (e2e.yml) or workflow name (E2E).
#   --wedged NAME       Disable the workflow, wait, re-enable it. Last resort: it kills queued runs.
#   --graceful          Skip the force-cancel endpoint and use the regular cancel request.
#   --dry-run           List what would be cancelled, change nothing.
#
# Auth: GH_TOKEN or GITHUB_TOKEN with `actions: write` on the repository. A logged-in `gh` CLI
# (gh auth login) is used as a fallback so the same token you already have works.
set -euo pipefail

API_ROOT="${GITHUB_API_URL:-https://api.github.com}"
API_VERSION="2022-11-28"
POLL_AFTER_CANCEL="${POLL_AFTER_CANCEL:-3}"

usage() {
  cat <<'USAGE'
Clears GitHub Actions runs that are wedged in the queue or stuck on "Cancelling...".

Usage:
  scripts/gh-actions-force-cancel.sh                      cancel every queued/in-progress run
  scripts/gh-actions-force-cancel.sh 163 164              cancel specific run ids
  scripts/gh-actions-force-cancel.sh --workflow e2e.yml   only runs of one workflow
  scripts/gh-actions-force-cancel.sh --wedged e2e.yml     disable + enable: drops the whole queue
  scripts/gh-actions-force-cancel.sh --graceful 163       plain cancel, without force-cancel

Options:
  --repo owner/name   Defaults to the `origin` remote of the current git checkout.
  --workflow NAME     Workflow file name (e2e.yml) or workflow name (E2E).
  --wedged NAME       Disable the workflow, wait, re-enable it. Last resort: kills queued runs.
  --graceful          Skip the force-cancel endpoint and use the regular cancel request.
  --dry-run           List what would be cancelled, change nothing.
  -h, --help          Show this text.

Auth: GH_TOKEN or GITHUB_TOKEN with `actions: write`, or a logged-in `gh` CLI.
USAGE
}

die() {
  echo "error: $*" >&2
  exit 1
}

repo=""
workflow=""
wedged=""
force="true"
dry_run="false"
args=()

while [ "$#" -gt 0 ]; do
  case "$1" in
    -h | --help)
      usage
      exit 0
      ;;
    --repo)
      [ "$#" -ge 2 ] || die "--repo needs owner/name"
      repo="$2"
      shift 2
      ;;
    --workflow)
      [ "$#" -ge 2 ] || die "--workflow needs a file name or workflow name"
      workflow="$2"
      shift 2
      ;;
    --wedged)
      [ "$#" -ge 2 ] || die "--wedged needs a workflow file name"
      wedged="$2"
      shift 2
      ;;
    --graceful)
      force="false"
      shift
      ;;
    --dry-run)
      dry_run="true"
      shift
      ;;
    --)
      shift
      while [ "$#" -gt 0 ]; do
        args+=("$1")
        shift
      done
      ;;
    -*)
      die "unknown option: $1 (try --help)"
      ;;
    *)
      args+=("$1")
      shift
      ;;
  esac
done

token="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
if [ -z "$token" ] && command -v gh >/dev/null 2>&1; then
  token="$(gh auth token 2>/dev/null || true)"
fi
[ -n "$token" ] || die "no token: export GH_TOKEN=... (needs actions: write) or run 'gh auth login'"

if [ -z "$repo" ]; then
  origin_url="$(git config --get remote.origin.url || true)"
  case "$origin_url" in
    git@github.com:*) repo="${origin_url#git@github.com:}" ;;
    ssh://git@github.com/*) repo="${origin_url#ssh://git@github.com/}" ;;
    https://github.com/*) repo="${origin_url#https://github.com/}" ;;
    *) die "cannot derive owner/repo from origin '$origin_url'; pass --repo owner/name" ;;
  esac
  repo="${repo%.git}"
fi

command -v curl >/dev/null 2>&1 || die "curl is required"
command -v node >/dev/null 2>&1 || die "node is required to parse API responses (the repo already needs it)"

RESP_FILE="$(mktemp)"
trap 'rm -f "$RESP_FILE"' EXIT

# api METHOD PATH -> prints the HTTP status code, leaves the body in $RESP_FILE.
api() {
  local method="$1" path="$2" out code
  out="$(curl -sS -X "$method" \
    -H "Authorization: Bearer $token" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: $API_VERSION" \
    -w $'\n%{http_code}' \
    "$API_ROOT$path" 2>&1)" || {
    printf '%s' "$out" >"$RESP_FILE"
    return 1
  }
  code="${out##*$'\n'}"
  printf '%s' "${out%$'\n'*}" >"$RESP_FILE"
  printf '%s' "$code"
}

body() {
  cat "$RESP_FILE" 2>/dev/null || true
}

# Workflow id for a file name ("e2e.yml"), a workflow name ("E2E") or a numeric id.
workflow_id() {
  local want="$1" code id
  code="$(api GET "/repos/$repo/actions/workflows?per_page=100")" ||
    die "listing workflows failed: $(body)"
  [ "$code" = "200" ] || die "listing workflows failed (HTTP $code): $(body)"
  id="$(WORKFLOW_WANT="$want" node -e '
    const fs = require("fs");
    const data = JSON.parse(fs.readFileSync(0, "utf8"));
    const want = process.env.WORKFLOW_WANT;
    const hit = (data.workflows || []).find((w) => {
      const path = w.path || "";
      return (
        path === want ||
        path.endsWith("/" + want) ||
        String(w.id) === want ||
        (w.name || "").toLowerCase() === want.toLowerCase()
      );
    });
    if (!hit) process.exit(3);
    process.stdout.write(String(hit.id));
  ' <"$RESP_FILE")" || die "workflow '$want' not found in $repo"
  printf '%s' "$id"
}

# Ids of runs in the given status that match --workflow, one per line.
list_run_ids() {
  local status="$1" page=1 code count chunk
  while :; do
    code="$(api GET "/repos/$repo/actions/runs?status=$status&per_page=100&page=$page")" ||
      die "listing $status runs failed: $(body)"
    [ "$code" = "200" ] || die "listing $status runs failed (HTTP $code): $(body)"
    chunk="$(WORKFLOW_FILTER="$workflow" node -e '
      const fs = require("fs");
      const data = JSON.parse(fs.readFileSync(0, "utf8"));
      const filter = (process.env.WORKFLOW_FILTER || "").toLowerCase();
      const runs = data.workflow_runs || [];
      const matches = (run) => {
        if (!filter) return true;
        const path = (run.path || "").toLowerCase();
        return (
          path === filter ||
          path.endsWith("/" + filter) ||
          (run.name || "").toLowerCase() === filter
        );
      };
      for (const run of runs) if (matches(run)) process.stdout.write(run.id + "\n");
      process.stderr.write(String(runs.length));
    ' <"$RESP_FILE" 2>"$RESP_FILE.count")"
    count="$(cat "$RESP_FILE.count")"
    if [ -n "$chunk" ]; then
      printf '%s\n' "$chunk"
    fi
    # A short page is the last page; the cap keeps a runaway queue from paging forever.
    if [ "$count" -lt 100 ] || [ "$page" -ge 10 ]; then
      break
    fi
    page=$((page + 1))
  done
  rm -f "$RESP_FILE.count"
}

cancel_run() {
  local id="$1" code
  if [ "$dry_run" = "true" ]; then
    echo "would cancel run $id"
    return 0
  fi
  if [ "$force" = "true" ]; then
    # Force-cancel skips the graceful shutdown handshake, which is the handshake that hangs on
    # "Cancelling...". It is the documented endpoint for exactly this situation.
    code="$(api POST "/repos/$repo/actions/runs/$id/force-cancel")" ||
      die "force-cancel of run $id failed: $(body)"
    if [ "$code" = "202" ]; then
      echo "force-cancelled run $id"
      return 0
    fi
    echo "force-cancel of run $id returned HTTP $code; falling back to cancel" >&2
  fi
  code="$(api POST "/repos/$repo/actions/runs/$id/cancel")" ||
    die "cancel of run $id failed: $(body)"
  case "$code" in
    202 | 200 | 204)
      echo "cancelled run $id"
      ;;
    *)
      echo "cancel of run $id failed (HTTP $code): $(body)" >&2
      return 1
      ;;
  esac
}

# Disabling a workflow drops everything it has queued; enabling it again makes it runnable. This is
# the only lever left when the orchestrator refuses to acknowledge a per-run cancel.
wedged_cycle() {
  local name="$1" id code
  id="$(workflow_id "$name")"
  if [ "$dry_run" = "true" ]; then
    echo "would disable, wait 15s and re-enable workflow $name (id $id)"
    return 0
  fi
  echo "disabling workflow $name (id $id)..."
  code="$(api PUT "/repos/$repo/actions/workflows/$id/disable")" ||
    die "disabling workflow $name failed: $(body)"
  [ "$code" = "204" ] || die "disabling workflow $name failed (HTTP $code): $(body)"
  echo "waiting 15s for the queue to drain..."
  sleep 15
  echo "re-enabling workflow $name..."
  code="$(api PUT "/repos/$repo/actions/workflows/$id/enable")" ||
    die "re-enabling workflow $name failed: $(body)"
  [ "$code" = "204" ] || die "re-enabling workflow $name failed (HTTP $code): $(body)"
  echo "workflow $name re-enabled; its queued runs are gone."
}

if [ -n "$wedged" ]; then
  wedged_cycle "$wedged"
  exit 0
fi

targets=()
if [ "${#args[@]}" -gt 0 ]; then
  for id in "${args[@]}"; do
    targets+=("$id")
  done
else
  echo "scanning $repo for queued and in-progress runs (${workflow:-all workflows})..."
  while IFS= read -r id; do
    [ -n "$id" ] && targets+=("$id")
  done < <(list_run_ids queued; list_run_ids in_progress)
fi

if [ "${#targets[@]}" -eq 0 ]; then
  echo "no matching queued or in-progress runs; nothing to cancel."
  exit 0
fi

echo "cancelling ${#targets[@]} run(s): ${targets[*]}"
failures=0
for id in "${targets[@]}"; do
  cancel_run "$id" || failures=$((failures + 1))
done

if [ "$failures" -gt 0 ]; then
  echo "" >&2
  echo "$failures run(s) still would not cancel. If they stay queued, drop the whole queue:" >&2
  echo "  scripts/gh-actions-force-cancel.sh --wedged ${workflow:-e2e.yml}" >&2
  exit 1
fi

if [ "$dry_run" != "true" ]; then
  # Cancellation is asynchronous: the run sits in "cancelling" until a runner acks it.
  sleep "$POLL_AFTER_CANCEL"
  echo "requests accepted. Check status with: gh run list --limit 20  (or the Actions tab)"
fi
