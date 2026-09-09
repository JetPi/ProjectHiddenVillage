# Workflow, environment & tooling gotchas (always-on)

## Efficient file access

- Never use exploratory `find`/`grep` for paths already established in
  conversation history — read/edit known files directly. Targeted searches only for
  new/unreferenced files. Prefer `read_files`/`search_codebase` over shell greps.
- Long-running commands (`npm run build`, `tsc`, `dotnet …`) time out in tool
  output. Launch detached and poll the log:
  `cd client && nohup npm run build > /tmp/x.log 2>&1 & disown`, then read
  `/tmp/x.log` with `read_files`.
- Shell is fish: quote grep patterns in single quotes; write command output to a
  file before reading it (stdout capture is often mangled). Avoid heredocs in
  `run_commands`.
- `tsc` binary lives at `client/node_modules/.bin/tsc`; after import refactors
  re-run the full build — barrel cycles surface at runtime/TDZ, not type errors.
- Watch import hygiene: switching `RefObject` → `RefCallback` requires removing the
  now-unused `RefObject` import (`@typescript-eslint/no-unused-vars`).

## Editing gotchas (hit repeatedly)

- Several files use CRLF and single-quote mismatches make the `editor` `old_text`
  match fail — rewrite whole files via a small python writer
  (`open(path,'w',encoding='utf-8',newline='\n').write(content)`) instead of
  fighting `old_text`. Keep editor payloads < ~6000 chars (split new files with a
  sentinel like `/*__MORE__*/` if needed).
- Worktree is often mid-WIP on branch `LeaderEffectImplementation`: check
  `git status --short` early and diff before assuming a file matches an earlier
  snapshot.

## Behavior-change discipline

- After state/UX refactors, Playwright (`npm run test:e2e`) is the trusted gate for
  targeting/summon/set-support/mulligan. If a change intentionally alters UX,
  update the affected spec (e.g. `e2e/gameview.multiplayer.battle-visuals.spec.ts`)
  instead of leaving stale assertions.
- Keep changes scoped and atomic; validate with local type checks/builds before
  marking done.
