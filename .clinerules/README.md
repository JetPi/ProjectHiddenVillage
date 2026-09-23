# Project Hidden Village — Agent Rules (index)

Every `.md`/`.txt` in `.clinerules/` is loaded by Cline. Files with a YAML
`paths:` frontmatter block load **only when a matching path is in context**;
files without it are always active. Keep always-on files short so startup stays
cheap, and put fine-grained detail in the path-scoped files (consult them when a
task touches that area).

## Stack

- `client/` — React 19 + TypeScript + Vite + Tailwind CSS.
- `server/` — ASP.NET Core minimal API + EF Core + PostgreSQL.
- `e2e/` — Playwright (`npm run test:e2e` → `http://127.0.0.1:4173/game/TEST1`).

## Golden rules (apply to every task)

- **Read before you edit** and validate before you finish: client `npm run build`
  (`tsc -b && vite build`) + `npm run lint`, server `dotnet build` / `dotnet test`,
  and Playwright for targeting/summon/set-support/mulligan UX changes.
- **Import barrels, no cycles**: external files import from
  `@/views/game/components` and `@/views/game/types` barrels only; never import a
  barrel from inside the folder it aggregates; siblings import each other via
  direct relative paths.
- **Refs / React Compiler lint (react-hooks v7)**: never read or forward refs
  during render. Owners keep `useRef` and expose stable `RefCallback` mount
  handlers from the hook that owns the ref; `.current` is read only inside
  effects/handlers. No eslint-disables; whole `client/src` lints clean.
- **Backend is authoritative** for legality/timing. The frontend is a pure
  consumer of `AvailableActions`, prompt state, and `GetCardActionTargets`
  responses.
- **If you intentionally change UX, update the matching Playwright spec** that
  encoded the old behavior.
- **Fish shell**: long-running commands time out in tool output — run them
  detached (`nohup … > /tmp/x.log 2>&1 & disown`) and poll the log with
  `read_files`; capture grep/eslint output in a file before reading it.

## Pending follow-ups (pick up here)

- **Commit the catalogue regeneration script** — `catalogEntries` is generated from
  `server/Api/rawCardCatalogDump.txt`; the working one-off script only lives in `/tmp`
  (details in `05-server-models-serialization.md`).
- **Rename the stale seeder test**
  `DevelopmentDeckSeederTests.SeedAsync_CreatesSupportCapablePlaceholder_ForN008_WhenCatalogIsMissing`
  — N-008 now always resolves from the manifest (the assertion still passes).
- **Add specs for the newly seeded real cards** (all listed in
  `03-targeting-contract.md`): quick support cut-in (N-002/N-008/N-010/N-021),
  When-Attacking reveal-summon, conditional Rush, leader Recovery, on-summon chains.
  The hand-support resolution, the N-006/N-017 range cut-in + multi-pick flows, the N-020 bounce and the
  N-009 negate (plus the support-row highlight geometry) live in
  `e2e/gameview.multiplayer.support.spec.ts` and
  `e2e/gameview.multiplayer.support-target-visuals.spec.ts`.
  **N-016's negate is fixed** (its chakra lock is now its own `Lock Chakra Recovery` runtime effect instead of
  a target-demanding `Alter Resources` node — see `05-server-models-serialization.md`) and covered by server
  tests; it still has no e2e.
- **Reveal presentation: shipped and covered end-to-end.**
  `e2e/gameview.multiplayer.reveal-presentation.spec.ts` plays N-019 for real — summon Jugo → stack the deck top with
  the leader's own `draw-n-place-card` ability (N-012) → attack → the reveal is presented (deck slot flips with the
  stacked card's definition id) → the client acks after `REVEAL_PRESENTATION_MS` → the revealed card **flies** out of
  the deck slot onto the field (asserted via the recorded entry animation + timestamp ordering), and the second test
  covers the un-reveal of a card the post-condition refuses. The DOM hooks it needs are in place
  (`data-testid="deck-pile-card"` / `data-revealed` / `data-card-definition-id` in `PlayPileZone`, see
  `02-board-ui-hud.md`), and both specs observe instead of polling because the presentation only lasts 2 s.
  Fixing that spec also uncovered and fixed a real engine bug: `ZoneCardRestrictionMatcher` /
  `LeaderTargetRestrictionMatcher` ignored `MatchMode: Any`, so N-019's "`[Sasuke Uchiha]` **or** `[The Taka]`"
  never matched through its second predicate (see `03-targeting-contract.md`).
- **`EffectTiming.OnSummon` has no engine runner** — the timing exists only as an enum/condition keyword, so an
  `[On Summon]` effect (N-013's reveal, N-005's summon, …) is never executed after a normal summon. Running those
  effects (mirroring `ExecuteAutomaticWhenAttackingEffects`) is the next feature step; it is also what would let the
  N-013 reveal be tested.
- **Optional regression test** for N-009 (Kakashi, Support-Activated “reduce your life by 2”):
  its `reduce-self-life` effect declares a target entry with `exactSelectedTargetCount: 0` while
  `targetRules.exactTargetCount` is 1 — harmless today, but pin the behaviour before touching it.

## Commands (quick)

- Frontend dev/build/lint: `cd client && npm run dev` / `npm run build` /
  `npm run lint`.
- Backend: `dotnet watch run --project server/ProjectHiddenVillage.Server.csproj
  --urls http://127.0.0.1:3001`; tests `dotnet test
  server/tests/ProjectHiddenVillage.Server.Tests/ProjectHiddenVillage.Server.Tests.csproj`.
- E2E: `npm run test:e2e`.

## Rule files (consult the one whose area you touch)

| File | Loads when paths match | Covers |
| --- | --- | --- |
| `01-architecture.md` | `client/src/**`, `server/**` | structure, barrels, refs patterns, anchors |
| `02-board-ui-hud.md` | board/card UI + `index.css` + battle-visuals e2e | overlays, stat badges, rested-vs-exhausted visuals, targeting highlight CSS |
| `03-targeting-contract.md` | game client, server game engine/API, e2e | targeting flows, action formats, battle-action rules (DMG/POW, leaders, target legality), tribute-material requirements, `Type` predicate normalization, submit decisions |
| `04-state-phase-effects.md` | stores, game hooks/effects, phase engine | Zustand, prune, auto-advance, main-phase auto-end, rest/stand + damage resets, draw/mulligan gating |
| `05-server-models-serialization.md` | `server/**`, `client/src/services/api/**` | response DTOs, STJ serialization gotcha, stat pipelines (leader life vs character health), exhaustion = exile, seed fixtures/real catalogue, known pre-existing test failures |
| `99-workflow-tooling.md` | always | environment/tooling/edit gotchas (keep short) |
