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

- **The game ends and both players see the result (shipped).** A write-once `GameState.Outcome`
  (`GameEndReason.LeaderLifeDepleted | DeckOut`) is resolved by the new `GameEndRules` (the single home, like
  `BattleActionRules`/`ChakraRecoveryRules`): every registry mutation now starts with
  `GameEndRules.ThrowIfGameOver` and ends by evaluating the leader condition, the draw paths resolve a
  deck-out (`GamePhaseStateService.DrawCardsForActivePlayerTurn`,
  `GameRuntimeDeckService.DrawCardFromDeck`), and the mapper publishes `GameOutcome` with **no** actions,
  prompt, support window or support chain (per-card actions included). The client renders a blocking
  `GameOverOverlay` (Victory/Defeat/Draw + reason + "Return to main page" → `/`) and
  `gameUIStore.pruneStaleGameUIState` drops every picker once the outcome arrives. Pinned by
  `GameEndRulesTests`, `InMemoryGameInstanceRegistryGameOverTests`,
  `GameStateResponseMapperGameOutcomeTests` and the new `deck-out` seed profile +
  `e2e/gameview.multiplayer.game-over.spec.ts`. Deliberately **no timeout/`TimeExpired`** reason: the rules'
  tiebreak (life → hand+support+battlefield → deck → draw) is only used when every player loses at once.
  Still open if wanted: a leader-defeat *battle* e2e (the engine half is unit-covered) and showing the
  opponents' names instead of ids in the overlay copy.
- **A leader's duration-scoped ability no longer stamps a permanent stat override (fixed).** The shared
  card-ability path handed the leader's `GameCardEffectContext` a null `SourceCardInstance`
  (`isLeader ? null : sourceCardInstance`), so every duration-scoped attribute/keyword/face-lock effect skipped its
  temporary branch and wrote the "permanent" one. N-001's "[Activate: Main] … the chosen card gets **+3 power
  during this turn**" (`ChangeValues`, `DuringThisTurn`) wrote the target's `PowerOverride`, which `CompleteEndStep`
  never clears — the +3 survived every later turn. The context now receives the acting card's source instance for a
  leader too (both call sites in `InMemoryGameInstanceRegistry`: `ExecuteCardAbilityAction` and
  `BuildCardAbilityActionTargets`), so `ModifyAttributeEffect`/`FreezeCardEffect`/`GainKeywordEffect` register a
  duration-scoped `AppliedCardEffectState` that `CompleteEndStep` dispels (the field-transition reset in
  `CharacterFieldStateRules` is the other half). Pinned by `InMemoryGameInstanceRegistryTests
  .ExecuteCardAction_LeaderChangeValues_DuringThisTurn_AppliesTemporaryEffectClearedAtEndStep`; the full Release
  suite is green (535 tests).
- **Leader Recovery works end-to-end (shipped).** `e2e/gameview.multiplayer.leader-recovery.spec.ts` now plays it
  through: first-turn refusal with its reason, "no passive chakra recovery", the chip becoming enabled from the
  second turn, and then the activation itself — the pool tops back up to five, the leader is rested in the payload
  **and** on the board (`rotate-[14deg]`), and the chip flips back to disabled with "All chakra cards are already
  face up." Three fixes made that possible: `ExecuteCardAction` supplies the `isSecondTurnOrLater` argument (via
  `EffectExecutionConditionArgumentKey.ToWireValue()`, so the key cannot drift from the enum the condition is
  matched by) for **every** card action, the new `ChakraRecoveryRules` (the single home shared by the mapper's
  availability gate and the registry) clamps a recovery to `PlayerState.ChakraCardCount = 5`, and the registry rests
  the leader when it executes a `Recovery` effect ("rest this card" is part of the ability and no authored payload
  carries it). Chakra *card* face state needs no authoring: the board renders the pool from `ResourcePool`
  (`GameZones` → `currentChakra`), so the clamp **is** the visual contract and `Player1CurrentChakras` /
  `Player2CurrentChakras` stay the vestigial per-card bookkeeping that support flips use.
- **A battlefield character's `[Activate: Main]` ability is reachable (shipped).** N-011 Ino Yamanaka's
  "[Activate: Main] … your Ino/Shikamaru/Choji gain Rush and +5 power/+1 damage" is now published on the card as
  `character-ability:{instanceId}:{effectKey}`, executed by the shared card-ability path
  (`GameStateResponseMapper.BuildCardAbilityOptions` / `ExecuteCardAbilityAction`) and routed by the client like
  a leader effect. Two shared pieces came out of it: `CardAbilityTimingRules` (the timing switch the mapper and
  the registry used to duplicate, the one home for leader *and* character abilities — `SupportTimingRules` stays
  separate because a support also depends on its zone and the reaction window it opens) and the renamed
  `ReactiveEffectExecutionConstants.AbilityKeyArgument` (`__abilityKey`, was `__leaderEffectKey`). The engine's
  MainPhase auto-end probe counts an enabled battlefield ability as a legal action, and
  `e2e/gameview.multiplayer.character-ability.spec.ts` covers the whole line end-to-end (summon Shikamaru +
  Choji + Ino → the summon-turn `Battle` chip is refused → activate the ability → +5 power/+1 damage on all
  three, the `Battle` chip flips to enabled as **Rush**, the opposing leader loses the boosted DMG, and the
  `[Once Per Turn]` chip reads its reason afterwards). Deliberately *not* covered: the support-zone MainPhase
  auto-end gap below, and N-022's EX tribute-summon reveal.
- **A support effect is no longer published as an ability on the character field (fixed).** Support effects are
  activated from the hand or the support area (`SupportTimingRules` owns when), so a support-capable card that is
  normal-summoned onto the character field must not expose its support node as an ability. It did: the shape gate
  only rejected subordinate/passive/summon-requirement nodes, so a battlefield N-015 published a **Support** chip
  ("[During Your Main] K.O. all Characters") next to Battle, a crafted `character-ability:` submit ran the K.O.
  from the field, and the MainPhase auto-end probe counted it as a legal action (N-002/N-008/N-021 would have
  exposed their Quick / attack-interruption supports the same way). The fourth shape is now in the same one home
  (`CardAbilityTimingRules.IsIndependentlyActivatableAbility` rejects `EffectType == EffectKind.Support`), so all
  three consumers agree; the support path itself is untouched (the hand chip still publishes, and the dump/seed
  needed no card-data change). Pinned by `CardAbilityTimingRulesTests
  .IsIndependentlyActivatableAbility_RejectsASupportEffect`, `GameStateResponseMapperCardActionsTests
  .ToGameStateResponse_HidesTheSupportEffectNode_FromTheCharacterAbilityActions` (+ the hand-side counterpart,
  `.ToGameStateResponse_KeepsPublishingTheSupportActivation_ForTheSupportEffectHandCard`) and three
  `InMemoryGameInstanceRegistryTests` cases (submit refused, targets disabled, MainPhase auto-ends). No e2e yet —
  the chip is server-published and the client renders `AvailableActions` verbatim, so a spec would only duplicate
  the mapper test; the N-015 support scenario in `e2e/gameview.multiplayer.support.spec.ts` (deck two) is where a
  field-summon assertion would belong if one is wanted.
- **A card's summon requirement is no longer published as an activatable ability (fixed).** The `Tribute` node
  behind "[Summon Requirements] Place 1 of your Characters in your trash" (N-003/N-005/N-014/N-022) is authored as
  a non-subordinate root with `timing: During Your Main`, so as soon as the card reached the battlefield the
  ability builder published it as a `character-ability:` chip — reading "During Your Main" (N-003's reads
  "Support", its node being authored with a Support effect type) — and a direct submit of it re-ran the whole
  reveal + summon chain, because only the chip builder filtered subordinate/passive nodes and the executor
  checked nothing but timing + once-per-turn. The shape question now has one home
  (`CardAbilityTimingRules.IsIndependentlyActivatableAbility`) used by the chip builder, the executor (which
  throws `EffectRestrictionMessages.NotAnActivatedAbility`) and the MainPhase auto-end probe;
  `CardAbilityTimingRulesTests`, `GameStateResponseMapperCardActionsTests
  .ToGameStateResponse_HidesTheSummonRequirementNode_FromTheCharacterAbilityActions` and three
  `InMemoryGameInstanceRegistryTests` cases pin it. No card data had to change: the authored `timing`/`effectType`
  on those nodes is inert metadata (the summon path resolves the node by `RuntimeEffects.Tribute`), N-003's
  `effectType: "Support"` is the only inconsistent spelling and it is harmless.
- **"No Normal Summon" no longer blocks a special summon (fixed).** `CannotBeNormalSummoned` gates the *normal*
  summon only — the one performed by resting the summon card — yet `SummonCardEffect` filtered its candidates and
  refused the placement on that flag, and `TributeSummonCardEffect` refused the same way. That made N-003's
  "[On Summon] Summon up to 1 [Naruto Uzumaki] from your deck or trash" unable to summon a copy of itself (the
  copies carry the flag — N-003 is an EX Character) and would have refused the very cards the
  `[Summon Requirements]` flow exists to summon. Both effects now use one shared rule,
  `SummonPlacementRules.IsPlaceableOnCharacterField` (Chakra/Summon types only); the flag is consulted nowhere in
  the summon-placement path, and a pool that must exclude special-summon-only cards is authored with a
  `CannotBeNormalSummoned` target predicate. Pinned by `SummonCardEffectTests` (a flagged candidate stays valid and
  is summoned, and a Chakra card *with* the flag is still refused as `UnsupportedCardType`),
  `TributeSummonCardEffectTests.Execute_SummonsTargetThatCannotBeNormalSummoned` and the real-effect
  `InMemoryGameInstanceRegistryOnSummonTests
  .ExecuteCardAction_NormalSummon_ResumedTrashRecall_SummonsCardThatCannotBeNormalSummoned`. N-003's own e2e
  scenario is still missing — its cross-zone `SummonFromZone` pick is only unit-covered.
- **N-022 Manda's EX tribute-summon reveal now fires (fixed).** The `[On Summon]` chain was authored with the wrong
  trigger timing: its nodes carried `Quick` (`reveal-top`) / `During Your Main` (`on-summon`) and **no** node was
  `On Summon`-timed, so `GameTriggeredEffectRunner.ExecuteAutomaticTimedEffects` — which dispatches purely on
  `EffectSpec.Timing` — never ran it and the top card was never revealed on summon. `reveal-top` is now
  `timing: On Summon` in both `test-data/seed-profiles.json` and `server/Api/rawCardCatalogDump.txt`, so the
  requirement summon (`ExecuteSummonRequirementAction` → `ExecuteAutomaticOnSummonEffects`) dispatches it and the
  `Reveal First` step suspends on the presentation prompt: the top card is shown whether or not it is a legal
  summon target, and on the ack the chain either summons it (a non-EX Character) or ends back in the MainPhase.
  Pinned by `InMemoryGameInstanceRegistryOnSummonTests
  .ExecuteCardAction_RequirementSummon_WithOnSummonReveal_SuspendsForPresentationThenSummonsTheRevealedCard` and,
  at the data level, by the new `SeedManifestAuthoringTests
  .CardsWithAnOnSummonCondition_HaveAMandatoryOnSummonTimedNode` (it would have failed for N-022 before this fix).
  The reveal *mechanic* itself is pinned by `e2e/gameview.multiplayer.reveal-presentation.spec.ts` (N-019 for an
  attack, N-013 for an `[On Summon]` summon). Still open: an N-022 **e2e** — stack the deck top with the leader's
  free `draw-n-place-card` ability, tribute a spare character through the hand chip's Tribute/Confirm flow, and
  reuse the deck-reveal observer + entry-animation recorder.
- **Commit the catalogue regeneration script** — `catalogEntries` is generated from
  `server/Api/rawCardCatalogDump.txt`; the working one-off script only lives in `/tmp`
  (details in `05-server-models-serialization.md`).
- **Rename the stale seeder test** — done:
  `DevelopmentDeckSeederTests.SeedAsync_SeedsSupportMetadata_ForN008AndN015_FromTheManifest`, because N-008/N-015
  always resolve from the manifest now.
- **Add specs for the newly seeded real cards** (all listed in
  `03-targeting-contract.md`): what is still open is an **e2e** for N-022's EX tribute-summon reveal (its server
  path is now covered — see the N-022 bullet above) — N-005's own trash recall
  and **N-014's prompted destroy** are now covered (see the
  `[On Summon]` runner bullet above), the leader Recovery activation is blocked by the
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
  **N-005's prompted trash recall is shipped** (the first auto-triggered node that collects a selection): its
  `on-summon` node is now `Per Step` + `selectionTiming: Prompted` + `selectionPromptKind: SummonFromZone`, so
  the `[On Summon]` chain suspends and asks for the trash card instead of silently summoning nothing. Covered by
  `GameSequentialEffectExecutorTests` (suspend with `CandidateZone: Trash` + resume; a zero-candidate prompt
  records a notice), `InMemoryGameInstanceRegistryOnSummonTests` (summon → prompt → `ResolvePrompt` → the answer
  reaches the resumed effect), `GameStateResponseMapperEffectNoticesTests` and — end-to-end —
  `e2e/gameview.multiplayer.actions.spec.ts` with the new `on-summon-trash-recall` profile (its `T-121`
  manifest fixture is a normally summonable [Naruto Uzumaki] with 10 power, so it is both a legal tribute
  material and a legal recall target: summon it, tribute it, answer the picker, watch it land again). The same
  spec's second scenario covers the **no-candidate** half: with only T-120 in the trash the board shows the
  transient `effect-notice-banner` ("Gamabunta's effect had no valid targets.") and stays fully playable.
  **N-013's freeze is fixed**: its `freeze-target` node is authored `Per Step` + `Prompted` with
  `selectionPromptKind: FreezeFromZone` in the seed **and** `rawCardCatalogDump.txt`, the freeze can target a
  leader (`FreezeCardEffect` writes through `PlayerZoneCardAccessor.ResolveLiveCard`), and the leader card now
  answers the pick with its own **Select** chip. The third scenario of
  `e2e/gameview.multiplayer.reveal-presentation.spec.ts` covers it end-to-end (the reveal is acknowledged, the
  `FreezeFromZone` prompt follows, both leaders are candidates, and the picked leader's `Battle` chip then reads
  the cannot-attack reason). **N-003's and N-014's chains are fixed**: both are authored `Per Step` +
  `Prompted` in the seed **and** `rawCardCatalogDump.txt` (`SummonFromZone` / `DestroyFromZone`), and
  `SeedManifestAuthoringTests` now runs every authored card through `UpdateCardEffectsRequestValidator` and
  compares each node's flow/timing/kind against the dump, so the drift cannot come back unnoticed. N-014's
  destroy is covered end-to-end by the `summon-requirements-multi` scenario in
  `e2e/gameview.multiplayer.actions.spec.ts` (the mixed tribute pays N-011 + N-019, then the card's own
  **Select** button answers the `Select a Character to destroy` prompt — the first board-zone prompt covered).
- **The N-012 dump drift is fixed** (and guarded): `server/Api/rawCardCatalogDump.txt` used to keep the *raw*
  imported `draw-n-place-card` node (one node with a Draw + a Move action, no `selectionTiming`) while
  `test-data/seed-profiles.json` splits it into `draw-n-place-card` + a `Prompted` `place-one-on-deck`. Both
  sources now carry the split, and `SeedManifestAuthoringTests.AuthoredNodesInTheManifest_KeepTheirShapeInTheRawDump`
  fails if any node's `ExecutionFlowMode`/`SelectionTiming`/`SelectionPromptKind` ever disagrees again. (The dump
  is still only read for docs/regeneration, but regenerating `catalogEntries` from it would otherwise silently
  lose authored shapes — patch both whenever a node's authored shape matters.)
- **N-009's flagged branch target is fixed**: `reduce-self-life` (the "reduce your life by 2" follow-up of the
  negate) was left `isSubordinate: false` by the ingestion even though `negate-effect` branches to it.
  `SupportActivationPlanner.IsRoot` tolerates that (a branch target is never a root whatever the flag says), but
  the admin authoring contract rejects it — so both authored sources now mark it subordinate and the manifest
  passes the validator clean. Nothing changes at runtime: the planner already planned the negate as the root and
  the follow-up as its chain step.
- **Manifest authoring is test-guarded now**: `SeedManifestAuthoringTests` loads the real
  `test-data/seed-profiles.json`, runs every card's effects through `UpdateCardEffectsRequestValidator` (the same
  contract the admin editor enforces — this is what caught N-009's unflagged branch target), pins the authored
  prompted `[On Summon]` nodes (N-003/N-005/N-014 → `Per Step` + `Prompted`) and fails when the raw dump
  disagrees with the manifest on any node's `ExecutionFlowMode`/`SelectionTiming`/`SelectionPromptKind`. Keep both
  files in sync; run `dotnet test --filter FullyQualifiedName~SeedManifestAuthoringTests` after touching either.
- **Optional regression test** for N-009 (Kakashi, Support-Activated "reduce your life by 2"):
  its `reduce-self-life` effect declares a target entry with `exactSelectedTargetCount: 0` while
  `targetRules.exactTargetCount` is 1 — harmless today, but pin the behaviour before touching it. (Its
  `isSubordinate` flag was fixed to `true` in both authored sources, which only satisfies the authoring contract:
  `SupportActivationPlanner.IsRoot` already refused to treat a branch target as a root.)

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
| `03-targeting-contract.md` | game client, server game engine/API, e2e | targeting flows, action formats, battle-action rules (DMG/POW, leaders, target legality), tribute-material requirements, game end/outcome + result overlay, `Type` predicate normalization, submit decisions |
| `04-state-phase-effects.md` | stores, game hooks/effects, phase engine | Zustand, prune, auto-advance, main-phase auto-end, rest/stand + damage resets, draw/mulligan gating |
| `05-server-models-serialization.md` | `server/**`, `client/src/services/api/**` | response DTOs, STJ serialization gotcha, stat pipelines (leader life vs character health), exhaustion = exile, seed fixtures/real catalogue, server test gates |
| `99-workflow-tooling.md` | always | environment/tooling/edit gotchas (keep short) |
