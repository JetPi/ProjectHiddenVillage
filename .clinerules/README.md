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

- **Leader Recovery is a silent no-op (engine gap; the spec pins the availability contract only).**
  `e2e/gameview.multiplayer.leader-recovery.spec.ts` covers the rules that do work (first-turn refusal with its
  reason, "no passive chakra recovery", and the chip becoming enabled from the second turn while chakra is face
  down) and stops there. Activating `leader-effect:*:recovery` is accepted by the hub but changes nothing:
  the node's `isSecondTurnOrLater` execution condition is matched against the execution **arguments**
  (`GameSequentialEffectExecutor.ConditionMatches` → `condition.Negate`, i.e. false, when the key is absent) and
  nothing in `server/Api`/`server/Engine` ever supplies that argument, so the step is skipped with no failure
  branch while the mapper's own availability gate (`GameStateResponseMapper.EffectAvailability` →
  `player.TurnCount < 2`) reports the chip as enabled. Two further gaps sit behind it: `AlterResourcesEffect`'s
  `Recover` **adds** the amount (`ApplyChakraAdjustment`: `pool + amount`), so N-001/N-012's `Recover 5` would
  push a 5-card pool to 9 from any non-empty pool, and neither recovery node authors a
  `SummonCardFlips`/`FaceStateLocks` entry, so the chakra cards themselves never turn face-up on the board.
  Fix sketch: (a) populate the `isSecondTurnOrLater` argument for the acting player when the action's context
  is built, (b) clamp `Recover` to the player's chakra-card count, (c) author the FaceUp/ChakraCard flip on both
  seeds (`test-data/seed-profiles.json` **and** `server/Api/rawCardCatalogDump.txt`).
- **A battlefield character's `[Activate: Main]` ability has no published action (UI gap).**
  `GameStateResponseMapper.CardActions.BuildCardAvailableActions` returns battle actions only for
  `PlayerZone.CharacterField`, and the client's submit map only knows `play-card:`, `set-support:`,
  `summon-to-field:`, `activate-support:`, `battle-action:` and `leader-effect:`. N-011 Ino Yamanaka's
  "[Activate: Main] … your Ino/Shikamaru/Choji gain Rush and +5 power/+1 damage" is therefore unreachable in
  play even though the engine models it (target rules + `contextRules` for the Shikamaru/Choji requirement are
  authored and correct). Covering it needs a new per-card action prefix for character-field abilities
  (mapper + `mapActionToHubIntent` + registry dispatch) before an e2e can exist.
- **N-022 Manda's EX tribute-summon reveal is still uncovered.** The reveal *mechanic* is pinned by
  `e2e/gameview.multiplayer.reveal-presentation.spec.ts` (N-019 for an attack, N-013 for an `[On Summon]`
  summon), but Manda's own chain — `tribute-requirement` (Atomic Chain, 1 field material + the hand candidate)
  → `reveal-top` (`Reveal First`, post-condition `Type Not Equals EX Character`) → `on-summon` (`Summon Card`,
  `exactTargetCount: 1` with a Self/Deck rule) — is untested. It should resolve the same way N-019's does
  (the reveal supplies the target through `ResolveRevealedTargets`, so no prompt is created); a spec can stack
  the deck top with the leader's free `draw-n-place-card` ability, tribute a spare character through the hand
  chip's Tribute/Confirm flow, and reuse the deck-reveal observer + entry-animation recorder.
- **Commit the catalogue regeneration script** — `catalogEntries` is generated from
  `server/Api/rawCardCatalogDump.txt`; the working one-off script only lives in `/tmp`
  (details in `05-server-models-serialization.md`).
- **Rename the stale seeder test**
  `DevelopmentDeckSeederTests.SeedAsync_CreatesSupportCapablePlaceholder_ForN008_WhenCatalogIsMissing`
  — N-008 now always resolves from the manifest (the assertion still passes).
- **Add specs for the newly seeded real cards** (all listed in
  `03-targeting-contract.md`): what is still open is the on-summon chains that need a selection
  (N-003/N-005/N-014, N-022's EX tribute-summon reveal) — the leader Recovery activation is blocked by the
  engine gap above, and N-011 by the UI gap above.
  The hand-support resolution, the N-006/N-017 range cut-in + multi-pick flows, the N-020 bounce, the N-008
  attack interruption, the N-010 life gain above the printed maximum (the `leader-life-badge` unclamped
  regression guard) and the N-009 negate (plus the support-row highlight geometry) live in
  `e2e/gameview.multiplayer.support.spec.ts` and
  `e2e/gameview.multiplayer.support-target-visuals.spec.ts`; **N-002's MainPhase cut-in is covered** by
  `e2e/gameview.multiplayer.quick-support.spec.ts` (a `[Quick]` support answers a queued activation from the
  support area — the support-timing + normalised-availability regression guard, see
  `03-targeting-contract.md`), and that spec's **second scenario** now covers the mirror case: **N-021 as the
  responder** (deck two answers deck one's K.O., the immunity it grants saves the shielded character while the
  opener's own one dies).
  **N-016's negate is fixed** (its chakra lock is now its own `Lock Chakra Recovery` runtime effect instead of
  a target-demanding `Alter Resources` node — see `05-server-models-serialization.md`) and covered by
  `e2e/gameview.multiplayer.negate-chakra-lock.spec.ts`: the negate is answered from the support area while the
  window waits, the queued K.O. never resolves, and the *activator's* Recovery chip is then refused with
  "Your chakra is locked and cannot be turned face-up." while the opener's stays enabled.
  **N-007's conditional Rush is covered** by `e2e/gameview.multiplayer.conditional-rush.spec.ts`: the chip of a
  freshly summoned Minato reads the summon-turn reason, the leader's +3 power crosses the 10-power threshold and
  the continuous passive flips the very same chip to enabled, and the attack lands its DMG on the opposing leader
  in that same MainPhase. **N-011's conditional Rush cannot be covered yet** — its `[Activate: Main]` ability has
  no published action (see the UI gap above).
- **Reveal presentation: shipped and covered end-to-end.**
  `e2e/gameview.multiplayer.reveal-presentation.spec.ts` plays N-019 for real — summon Jugo → stack the deck top with
  the leader's own `draw-n-place-card` ability (N-012) → attack → the reveal is presented (deck slot flips with the
  stacked card's definition id) → the client acks after `REVEAL_PRESENTATION_MS` → the revealed card **flies** out of
  the deck slot onto the field (asserted via the recorded entry animation + timestamp ordering), the second test
  covers the un-reveal of a card the post-condition refuses, and the **third** plays N-013's `[On Summon]` reveal —
  the summon itself suspends the chain on the presentation and the card goes back face down in the deck. The DOM
  hooks it needs are in place
  (`data-testid="deck-pile-card"` / `data-revealed` / `data-card-definition-id` in `PlayPileZone`, see
  `02-board-ui-hud.md`), and the scenarios observe instead of polling because the presentation only lasts 2 s.
  Fixing that spec also uncovered and fixed a real engine bug: `ZoneCardRestrictionMatcher` /
  `LeaderTargetRestrictionMatcher` ignored `MatchMode: Any`, so N-019's "`[Sasuke Uchiha]` **or** `[The Taka]`"
  never matched through its second predicate (see `03-targeting-contract.md`).
- **`EffectTiming.OnSummon` runner: shipped** (commit `d9afad2` —
  `GameTriggeredEffectRunner.ExecuteAutomaticTimedEffects`, wired into the registry's summons and the summon effects).
  N-013's on-summon reveal is now covered end-to-end by the **third** scenario in
  `e2e/gameview.multiplayer.reveal-presentation.spec.ts` (the summon itself suspends the chain on the presentation,
  then the card goes back face down), so an `[On Summon]` effect runs after a normal summon.
  **Still open:** a target-demanding auto-triggered node collects no selection, so N-013's `freeze-target` and
  N-003/N-005/N-014's summon/destroy chains silently no-op (`Upfront` + `exactTargetCount: 1`). That needs
  `selectionTiming: Prompted` on those nodes (seed **and** `rawCardCatalogDump.txt`) plus client support for a
  `CandidateZone: Leader` board prompt — see `03-targeting-contract.md`.
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
| `05-server-models-serialization.md` | `server/**`, `client/src/services/api/**` | response DTOs, STJ serialization gotcha, stat pipelines (leader life vs character health), exhaustion = exile, seed fixtures/real catalogue, server test gates |
| `99-workflow-tooling.md` | always | environment/tooling/edit gotchas (keep short) |
