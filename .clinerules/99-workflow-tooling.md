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
  `run_commands`. **`$?` does not exist in fish** — `echo "EXIT=$?"` is a parse error
  that aborts the whole chained command, so earlier steps silently never run (use
  `$status`, or drop the exit-code echo and read the log file instead). Quote globs too:
  `grep --include='*.ts'` / `client/src/**/*.ts` are fish parse errors when unquoted, and the
  tool may report the command as "successful" while showing stale terminal output — always read
  the redirect target to confirm the step really ran.
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
- Large data files (`test-data/seed-profiles.json` is 3k+ lines): never paste regenerated JSON
  through one editor call. Write each new record as its own small `/tmp/frag_*.json` file
  (split anything >6k chars into `_part1`/`_part2`), then run a tiny `/tmp/patch_*.py` that
  splices the fragments in via `str.replace`/`rindex` anchors and asserts every anchor matched.
  Keeps the surrounding formatting byte-identical and the result verifiable from its log.

## Behavior-change discipline

- After state/UX refactors, Playwright (`npm run test:e2e`) is the trusted gate for
  targeting/summon/set-support/mulligan. If a change intentionally alters UX,
  update the affected spec (e.g. `e2e/gameview.multiplayer.battle-visuals.spec.ts`)
  instead of leaving stale assertions.
- Keep changes scoped and atomic; validate with local type checks/builds before
  marking done.
- Never run `dotnet build` while a Playwright run is starting its own server (`e2e:start`
  runs `dotnet run`): the build reports a lone "1 Error" with no compiler message purely
  because the server holds the output DLL. Re-run the build on its own to confirm.
- The reverse collision bites harder: **do not run `dotnet build` / `dotnet test` / `npm run test:e2e`
  while the dev stack is live** (`npm run dev` → `concurrently` vite + `dotnet watch run … --urls
  http://127.0.0.1:3001`). Every one of them builds `server/ProjectHiddenVillage.Server.csproj` into the
  same `server/bin/Debug/net10.0` the watch process launched from, and watch holds pending hot-reload
  patches (`DOTNET_MODIFIABLE_ASSEMBLIES=debug` + `Microsoft.Extensions.DotNetDeltaApplier`). Replacing
  that DLL underneath it leaves the delta baseline stale, so the next call on a patched path dies inside
  CoreCLR with a metadata-validation error — observed as
  `Signature is not IMAGE_CEE_CS_CALLCONV_LOCAL_SIG.` (the string sits in `libcoreclr.so`, in the
  “Bad IL range / Bad class token” validation block) when a player pressed Pass on a freshly patched
  `InMemoryGameInstanceRegistry`. Recovery: restart the dev stack (Ctrl+C → `npm run dev`), or
  `rm -rf server/bin server/obj` first if it recurs; in-memory games do not survive that restart.

## Advance-phase read-then-act race (handled — do not “fix” it again)

- Helpers that advance phases (`advanceToMulliganPromptIfNeeded` in
  `helpers/multiplayer/prompts.ts`, `progressToNextDecisionWindow` in
  `helpers/multiplayer/flow.ts`) call **`tryAdvancePhaseViaHub`** (non-asserting) instead of the
  throwing `advancePhaseViaHub`, and treat a rejection with
  `ADVANCE_PHASE_INVALID_STATE_ERROR_CODE` (`Game.AdvancePhase.InvalidState`) as expected: the
  phase can advance, or a prompt can appear, between the REST state read and the hub call, so the
  server legitimately refuses. They re-read the state and retry; any other error still fails loudly.
- New read-then-act hub helpers should follow the same shape: use
  `invokeGameHubMethod`/`tryAdvancePhaseViaHub` + `describeHubFailure` from
  `helpers/multiplayer/hub.ts` rather than asserting inside the helper.
- The end-step pair got the same treatment after a `leader-battle` flake:
  `progressToNextDecisionWindow` uses `tryDeclareEndStepViaHub` /
  `tryCompleteEndStepViaHub` and treats `Game.DeclareEndStep.InvalidState` /
  `Game.CompleteEndStep.InvalidState` (`DECLARE_END_STEP_INVALID_STATE_ERROR_CODE` /
  `COMPLETE_END_STEP_INVALID_STATE_ERROR_CODE`) as "waiting" instead of failing, because the
  phase can auto-complete between the state read and the call.
- Driving the attack cut-in window has the same hazard from the other side: `passThroughActionStep` in
  `gameview.multiplayer.attack-sequence.spec.ts` must wait for the declaration to *appear* as
  `ActionStep` (`waitForActionStep`) before it may conclude that nobody can pass, and it re-reads when
  a snapshot offers no pass. Its old early `return` fired on the pre-declaration snapshot, so the
  attack then sat in `ActionStep` until the 25 s `MainPhase` poll failed — a one-off suite flake, not a
  pass-count bug (the window always needed the double pass, and the support specs already send two).
