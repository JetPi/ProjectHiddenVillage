---
paths:
  - "client/src/views/game/**"
  - "server/Api/Services/Games/**"
  - "server/Api/Hubs/**"
  - "server/Engine/Services/InMemoryGameInstanceRegistry.cs"
  - "e2e/**"
---

# Game contract: actions & targeting

## Action scopes & ID formats

- Global actions live in `GameStateResponse.AvailableActions`; per-card actions in
  `CardInstanceResponse.AvailableActions`.
- Hand card `play-card:{instanceId}` · support `activate-support:{instanceId}` ·
  battlefield `battle-action:{instanceId}` · leader
  `leader-effect:{leaderInstanceId}:{effectKey}` (effectKey = effect `Id` or
  `index-{i}`). Phase-level: `advance-phase`, `turn-end`/`endPhase`
  (`declare-end-step`), `complete-end-step`, `pass-turn`, `resolve-prompt:*`.

## Targeting state (client)

- Single picker state `pendingCardTargeting = { actionId, sourceCardInstanceId,
  validTargets, kind: 'battle' | 'effect' }` in `gameUIStore`.
  - `kind: 'battle'` = attack (optimistic rest + attack-link arrow on submit).
  - `kind: 'effect'` = plain single-target effect (leader/support/card effect).
- Board highlight + click handling is driven purely off this state.
- Summon tribute targeting is a separate `pendingSummonTargeting` state and is
  multi-toggle + confirm (see SidebarButtons). Tributes are toggled via each valid
  card’s hover **“Tribute”** button (see `02-board-ui-hud.md`), not by whole-card
  clicks.
- Range effects (“choose up to 2 rested Characters”) use a third picker state,
  `pendingEffectTargeting = { actionId, sourceCardInstanceId, validTargets,
  exact/min/maxTargetCount, selectedTargets }`. `trySubmitTargetedCardEffect` routes
  there whenever `exactTargetCount > 1 || maximumTargetCount > 1`; candidates toggle
  through the same per-card hover pattern (**“Select”/“Selected”**) and the phase row
  **Confirm** chip submits. `canConfirmEffectTargetSelection` decides the chip and the
  phase text (`Selecting support targets (needs: N)` → `Fulfilled target selection`)
  from the server counts; with only a maximum the floor is one pick.
- Every selection mode (battle/effect/summon/effect-range) can be exited
  via the phase-row **Cancel** chip (`02-board-ui-hud.md`) or the sidebar `X`; both
  call the store’s `cancel*` actions and never submit to the hub.

## Effect activation decision (`trySubmitTargetedCardEffect`)

Used by `leader-effect:*` and `activate-support:*`. It first asks
`GetCardActionTargets`, then:

1. Auto-executes when `autoSelectAllValidTargets` (with valid targets), when there
   are **no** valid targets (untargeted effect), or when valid-target count equals
   `exactTargetCount` for a **non** single-pick rule (multi exact “take all”).
2. **Always enters target selection (`kind: 'effect'`)** when a single target must
   be picked (`exact/min/max` each null-or-1) and there is at least one valid
   target — even if there is exactly one candidate. Never auto-spend the effect
   (chakra) in that case; the player must click the target (via “Choose”, see
   `02-board-ui-hud.md`).
3. Multi-target effects with a range (>1 choices) are not yet client-driven.

Attack (`battle-action:*`) always enters `kind: 'battle'` targeting when valid
targets exist.

## Battle actions (battlefield cards & leaders)

- `battle-action:{instanceId}` is published per card — battlefield **and** leader — with
  `Label: "Battle"`. It is emitted for the requesting player's own card (disabled with a
  reason when it cannot be declared).
- **Legality has exactly one home**: `server/Api/Services/Games/BattleActionRules.cs`
  (`ResolveRestriction` / `CanDeclareBattleAction`, `BattleActionRestriction` =
  `FirstTurn | CardRested | CannotAttackEffect | EnteredFieldThisTurn`, plus `HasRushKeyword`).
  The mapper's `CanDeclareBattleAction` wraps it into `ErrorOr` (`BattleAction.*` codes + the
  user-facing copy) and the engine's `HasAnyMainPhaseLegalAction` calls it directly (see
  `04-state-phase-effects.md`). Never re-implement these rules on either side.
- Leaders follow battlefield rules with one difference: the summon-turn rule does not apply
  (leaders are always on the field), so Rush is irrelevant for them.
- Targeting for `battle-action`: the opposing **leader is always a valid target** (leaders are
  attackable in Active Mode) plus the opponent's **rested** characters only. There is **no
  power gate** — any active attacker may declare, and the attacker rests on declaration.
- Damage: the attacker's **DMG** reduces the defending **leader's life**; the attacker's
  **POW** reduces a defending **character's health**. Only the defender takes damage (no
  retaliation). See `05-server-models-serialization.md` for the stat resolvers and
  `04-state-phase-effects.md` for the per-turn reset.
- `LeaderCardInstanceState : CardInstance`, so anything that resolves an attacker/defender must
  consider battlefield **or** leader — the registry helpers `FindOwnedCardInstance` /
  `FindCardInstanceWithOwner` do exactly that.
- **Attack interruption** (`InterruptAttackEffect`, N-008's "[During Your Opponent's Attack] Summon this card and
  interrupt that attack."): answered from the support area during the attack's support cut-in window
  (`IsInterruptWindow` = `ActionStep` **or** `AttackResolution`, defender + priority, pending attack), and it
  collects **no** target at all — the published plan is enabled with an empty candidate list, so the client
  auto-submits without a picker. It clears every `PendingAttack*` field and sets `Phase = BattleEndStep`; queued
  supports resolve after the double pass but *before* damage, so interrupting really does prevent the damage. It
  never writes restedness (see `04-state-phase-effects.md` → rest/stand). Covered by
  `SupportActivationResolutionTests.ActivateSupport_InterruptAttack_*` and the N-008 scenario in
  `e2e/gameview.multiplayer.support.spec.ts`.
  - The queued replay runs **as the activator's action**: `ExecutePendingActivation` hands priority back to the
    activating player for the duration and restores what the closing pass left behind. Its own gate demands
    priority (the closing pass cleared it), so without the hand-back the interrupt silently took its failure
    branch and the attack resolved as if it had never answered.

## Server `GetCardActionTargets`

Returns `GameCardActionTargetsResponse` (`IsEnabled`, `DisabledReason`,
`ValidTargets`, `Minimum/Maximum/ExactTargetCount`, `AutoSelectAllValidTargets`,
plus the tribute payload `RequirementLabels` / `MaterialRequirements`)
for prefixes `summon-to-field`, `activate-support`, `battle-action`, and
`leader-effect` — implemented by `InMemoryGameInstanceRegistry.GetCardActionTargets`
+ its `Build*CardActionTargets` methods. `ExecuteCardAction` applies effects to the
request’s `SelectedTargets`; effects auto-resolve targets only when
`TargetRules.AutoSelectAllValidTargets` is set.

## Support activation window (MainPhase)

- A MainPhase support activation is **paid + consumed immediately** but only *resolves* when the window
  closes (`ResolvePendingActivations` replays the queue LIFO). Queueing hands priority to the opponent, so
  they may answer with a `[Support Activated]` card (or a negate) first.
- The window is a **support cut-in response window**, so a `[Quick]` support (N-002) may answer the queued
  activation from the support area as well: `SupportTimingRules.IsOpponentTurnQuickWindow` accepts both the
  attack's support cut-in step *and* this reaction window (opponent's turn, holding priority, support area only).
  Before that, N-002's chip read "Support timing is not available right now." exactly while the window was
  waiting for this player.
- Support availability is evaluated on the **normalised** entry node
  (`GameStateResponseMapper.ResolveActivationEntryEffect` → `SupportActivationNormalizer.NormalizeEffect`) because
  that is the shape the engine executes. "Summon this card" (N-002/N-008/N-010/N-021) is authored as a
  summon-candidate rule pointing at the *hand*, so activating the same card from the support area resolved zero
  valid targets and the published chip read "No valid targets available." even though a submit would execute.
- "Requires a player selection" has one home: `EffectTargetRequirementAnalyzer.RequiresPlayerSelection`, which
  both the availability gate (`GameStateResponseMapper.RequiresTargets`) and the engine's target-count bounds
  (`GameEffectCanExecuteEvaluator.TryResolveTargetCountBounds`) call. Authored counts on a self-resolving node
  (N-008's `Interrupt Attack` carries a leftover `exactTargetCount`) and a bare default `Selected Targets` source
  nobody authored a rule for (N-012's `recovery`) are **not** a request for a selection — treating them as one made
  those abilities read "No valid targets available." and unplayable. `EvaluateEffectAvailability` only asks the
  evaluator to resolve candidates when the node actually collects a selection (`RequestsResolvedTargets`).
- **One decline closes the window**: `DeclarePassInSupportWindow` resolves on the passing player's first
  pass. The activator is therefore only ever asked for a response after the opponent actually reacted
  (their activation flipped priority back) — a decline by the asked player has nothing left to answer, so
  the activation resolves and priority returns to the turn player, who can play the next support.
- The **attack cut-in window (`ActionStep`) is the exception**: it closes on the *second* pass
  (`GamePhaseStateService.DeclarePassInActionStep` returns `true` only then), and the registry gates
  `ResolvePendingActivations` **and** `ApplyPendingAttackResolutionIfNeeded` on that returned value — so the
  closing pass resolves the queue *and* takes the damage step in one submit. Ignoring the return (the old
  behaviour) applied the effects while the window was still open and left the attack waiting for one pointless
  extra pass after they had already resolved; `ActivateSupport_DuringCutIn_WaitsForDoublePass_ThenResolvesMostRecentFirst`
  and `ActivateSupport_ResolvesTheChainAndTheDamageStepTogether_OnTheClosingPass` pin it.
- The server publishes `GameStateResponse.IsSupportResponseWindowOpen` (`true` only in the MainPhase with a
  pending activation); the phase row renders `Support Activated · Your Response` /
  `Support Activated · Opponent Response` from it (see `getSupportResponseWindowPhaseValue` in
  `views/game/utils/functions/helpers/index.ts`). While the window is open only support responses + `pass`
  are offered, so the phase row is what tells the player why everything else is waiting.
- **One activation per card and chain**: while a card's own activation is still queued it cannot be activated
  again. The rule lives in `SupportTimingRules.IsCardPendingOnResolutionStack`, and both sides use it — the
  mapper publishes **no** `activate-support:` action for that card (the client's Support button is removed,
  not disabled) and the engine refuses a direct submit with
  `EffectRestrictionMessages.AlreadyActivatedInChain`. The card drops off the stack as soon as the window
  closes (resolved or negated, a spent support leaves the support area anyway).
- The chain itself is published for the UI: `GameStateResponse.SupportChain` lists the queued activations
  oldest-first (`SupportChainEntryResponse`: `EntryId`, `Sequence`, `PlayerId`, `SourceCardInstanceId`,
  `SourceCardDisplayName`, `IsNegated`, `Targets`), where a target with `IsChainEntry` + `ChainEntryId` is the
  queued activation that this one answers (a `[Support Activated]` negate). The board renders it as the
  support-chain bubble (see `02-board-ui-hud.md`).
- **Every root group of a support runs**: `SupportActivationPlanner.PlanActivationGroups` keeps each unlinked
  root separate because `GameSequentialEffectExecutor` walks *one* chain per call (entry node +
  `OnSuccess/OnFailure` branches). `ExecutePendingActivation` therefore replays one `Execute` per group, which
  is what makes N-016 work — its chakra lock is a second root that no branch reaches. The activation cost is
  already paid at queue time (`ActivationCostPaidArgument`), so replaying several groups charges nothing extra.
- **Player-scoped nodes need no selection**: a node whose payload only touches players by `TargetRange`
  (N-016's chakra lock; own-leader/own-chakra modifications) is normalised to
  `EffectExecutionTargetSource.None` by `SupportActivationNormalizer`, which also rescues ingested data that
  marks such a node as `Selected Targets` with no target rules — the shape that used to fail with
  “No valid targets available.” (`IsOwnLeaderOnlyModification` / `IsOwnStateEffect`).
- A hand activation sends the card to the trash as it is queued (the trash fills *before* the effect
  resolves); **a support-area activation stays revealed in its slot until it resolves, then the used card
  leaves the support area for the trash** (`DiscardUsedSupportSource` — a spent support is never parked
  face up, and a negated activation is spent all the same).
- `set-support:{instanceId}` stops being a targeting action: the engine places the card in the **leftmost
  empty support slot** (`TryResolveSupportSlotIndex`), so the client submits straight from the hand chip and
  animates the card to its landing slot. An explicit `arguments.supportSlotIndex` is still honoured when it
  is valid and free (the request validator only checks it when it is present).

## Tribute material requirements (server-declared — never derived client-side)

- `GameCardActionTargetsResponse` carries both `RequirementLabels` (per-candidate short labels; an
  empty list = that candidate only satisfies a generic rule) and **`MaterialRequirements`** — the
  authoritative groups from `TributeMaterialRequirementBuilder.BuildGroups`:
  `{ label, requiredCount, isGeneric }`. Rules sharing a label are merged, so two "Toad" rules read
  `Toad x2` and never `Toad x1 + any x1`; slots beyond the named rules go to the only rule with
  headroom, otherwise they become a generic `any` group. That builder also owns the tribute count
  helpers (`ResolveExact/Minimum/MaximumTargetCount`) — do not re-derive them elsewhere.
- The client (`ISummonTargetingState.materialRequirements` → `getTributeRequirementSummary`) must not
  infer group sizes from candidate labels; it only distributes the current selection over the declared
  groups (named match first, then the generic group).
- Phase text contract (asserted in `e2e/gameview.multiplayer.actions.spec.ts`):
  `Selecting tribute materials (needs: (<label> x<n>, …))` while picking → shrinks as groups are paid
  → `Fulfilled tribute requirements` once every group is covered **and**
  `canConfirmSummonTargetSelection` passes. Both literals come from `PhaseValues` in
  `client/src/views/game/components/constants/gamePhaseActionRow.ts`; the composer lives in
  `views/game/utils/functions/helpers/index.ts` (`getTributeSelectionPhaseValue`).
- Summon-rule fixtures: N-005/Gamabunta = one `Power ≥ 10` material (satisfied by the T-120 fixture);
  N-014 = `any x1` + `The Taka x1` (paid with N-011 + N-019); N-003 = `Power ≥ 10` + `any`.
- Covered in `e2e/gameview.multiplayer.support.spec.ts` after the seeded real cards landed: a hand
  support resolving after the opponent's single decline, the N-006/N-017 range flow (support set into the
  support area → `[During Your Opponent's Attack]` activation in the cut-in window → multi-pick “Select” +
  **Confirm** → K.O. of the rested attacker, then the used support leaving for the trash), and the N-020
  bounce (single-pick “Choose” → the character flies back into its owner's hand).
- `e2e/gameview.multiplayer.support-target-visuals.spec.ts` covers the N-009 `[Support Activated]` negate
  (set face down → the opponent's `During Your Main` K.O. support activated from the support area → the negate
  targeting the queued activation, i.e. a card in the *opponent's* support row → K.O. never happens) and pins
  the support-row geometry across the highlight (see `02-board-ui-hud.md`).
- `e2e/gameview.multiplayer.quick-support.spec.ts` covers the MainPhase support cut-in for a `[Quick]` support:
  the opener activates N-021 from the support area during their MainPhase, the answerer's own **N-002** (in *their*
  support area) must publish an **enabled** `activate-support:` chip for that window, and activating it (single-pick
  doubling target) runs the chain - the summoned card lands on the field. This is the regression guard for the two
  bullets above.
- `e2e/gameview.multiplayer.support.spec.ts` also covers **N-008's attack interruption**: player two attacks,
  player one's `InterruptAttack` support (set face down beforehand) must publish an **enabled** chip with no target
  pick, and the resolution cancels the attack (no leader damage, phase → `BattleEndStep`, attacker still rested)
  while summoning the support card itself onto the defender's field.
- `e2e/gameview.multiplayer.support.spec.ts` also covers **N-010's life gain** in that window (deck two, so player one
  attacks): the own-leader `Change Values` node is normalised selection-free
  (`SupportActivationNormalizer.IsOwnLeaderOnlyModification`), so the plan must publish an **empty** candidate list
  and the chip submits straight from the support area; the defending leader then ends the turn at
  *printed max + 2 - the attacker's DMG*, i.e. **above** `totalLife`, and the `leader-life-badge` has to render that
  value (the server used to clamp it - `GameStateResponseMapperLeaderLifeTests`).
- Not yet covered by e2e although the cards are seeded: the remaining Quick support cut-ins as the *responder*
  (N-021; N-010 carries no `[Quick]` - its cut-in activation is the bullet above), the remaining When-Attacking
  reveal-summons (N-013/N-022; N-019's reveal-summon is covered by the reveal-presentation spec), conditional Rush
  (N-007/N-011), leader Recovery (N-001/N-012), and the on-summon chains that need a selection
  (N-003/N-005/N-014 - see the `[On Summon]` runner bullet in the reveal-presentation section). N-016's negate works
  again (its chakra lock is its own runtime effect,
  see `05-server-models-serialization.md`) and is covered by
  `SupportActivationResolutionTests.ActivateSupport_WithChakraLock_…` plus
  `LockChakraRecoveryEffectTests`; an e2e for it is still open.

## Reveal presentation (a `Reveal First` reveal)

- A `RevealTimingMode.RevealFirst` reveal is *presented*, not silently applied: the step runs, the success/failure
  branch is picked, and then `GameSequentialEffectExecutor` suspends the chain on a `GamePromptType.Effect` prompt with
  `SelectionPromptKind = RevealPresentation` (single option `ReactiveEffectExecutionConstants.RevealPresentedOption`) so
  the client can show the card before the rest of the chain (summon / freeze) runs. Both the per-step path and the
  atomic-chain path suspend — N-019's reveal is an atomic chain, N-013/N-022 are per-step.
- Only reveals the acting player could not already see are presented (`FilterPresentableReveals`): a deck card, or an
  opponent's hand / face-down support card. Revealing an already-visible card keeps the chain moving. A reveal whose
  picked branch target does not exist (`CanResumeAt`) never suspends either: the chain has to fail inside the caller
  that records the skip, not later from the prompt resolver.
- The acknowledgement is not a selection: `Resume` reuses `continuation.SelectedTargets` whenever
  `PendingEffectContinuation.RevealPresentation` is set, so a resumed "summon the revealed card" node still summons the
  card the reveal published (through the `revealedTargetIds` argument).
- Reveals made by a `Reveal First` step are **transient**: when the chain that made them finishes — including the
  resumed one — `ClearPresentedReveals` turns the cards back down, unless a card left the zone it was revealed in (that
  cleared the reveal on its own). `RevealTimingMode.RevealLast` keeps the old "stays revealed until it changes zone"
  semantics, so an information reveal opts out simply by not using `Reveal First` (all three real `Reveal First` cards —
  N-013/N-019/N-022 — are transient deck-top reveals).
- `CardInstanceResponse.IsRevealed` publishes the reveal (set in the deck, concealed-support and enriched branches of
  `GameStateResponseMapper.Zones`) so the board can flip the card face up (see `02-board-ui-hud.md`). `IsFaceUp` cannot
  stand in for it: a deck card is data-wise face up, so the reveal would be invisible in the payload.
- The client never renders a picker for a presentation prompt (`toPromptPresentation` keeps it out of the overlay and
  `resolveBoardPromptCandidateInstanceIds` ignores it) — it acks on its own after `REVEAL_PRESENTATION_MS`
  (`useRevealPresentationAckEffect`).
- Covered by `GameSequentialEffectExecutorTests.Execute_RevealFirst*` and
  `InMemoryGameInstanceRegistryWhenAttackingTests` (when-attacking reveal → attack still completes → ack → summon, or
  flip back when the post-condition fails), plus the end-to-end
  `e2e/gameview.multiplayer.reveal-presentation.spec.ts`. That spec plays N-019 for real: it summons Jugo, stacks the
  deck top with the leader's own `draw-n-place-card` ability (N-012), attacks, and then asserts the flip, the pause,
  the auto-ack, the summoned card's deck→field flight and (in the second test) the un-reveal of a card the
  post-condition refuses. Two presentation facts are only observable in that window, so the spec observes instead of
  polling: `installDeckRevealObserver` (deck slot attributes) and `installBattlefieldEntryAnimationRecorder`
  (character-field entry animations, with page-clock timestamps to prove the summon happened *after* the flip).
- **`[On Summon]` has a runner**: `GameTriggeredEffectRunner.ExecuteAutomaticTimedEffects` is called by the
  registry's normal/tribute summon and by `SummonCardEffect`/`TributeSummonCardEffect`, dispatches mandatory effects
  only, caps nested dispatches (`MaxTriggerDepth`) and logs a failure as `on_summon_effect_skipped` instead of
  throwing (`InMemoryGameInstanceRegistryOnSummonTests`). N-013's reveal is the third scenario in
  `e2e/gameview.multiplayer.reveal-presentation.spec.ts`: the summon itself suspends the chain on the presentation
  (the card is already on the field) and the presented deck card goes back face down afterwards.
- **What an auto-triggered node still cannot do** is collect a selection. N-013's own `freeze-target` is `Upfront`
  with an authored `exactTargetCount: 1` (the only `selectionTiming: Prompted` in the whole seed is N-012's leader
  ability), so as a trigger step it resolves no targets, fails `CanExecute` and takes its empty failure branch - a
  silent no-op. Same shape in N-003/N-005/N-014's on-summon `Summon Card` / `Destroy Card` chains. Fixing it means
  (a) `selectionTiming: Prompted` on the node in `test-data/seed-profiles.json` **and**
  `server/Api/rawCardCatalogDump.txt`, and (b) client support for a board-answerable prompt whose `CandidateZone` is
  `Leader` - `BOARD_PROMPT_SELECTION_ZONES` (`state/gameUIStore.ts`) and `toPromptPresentation` only accept
  Hand/CharacterField/SupportZone, so a N-013 freeze prompt would have no clickable candidate today.

## Card-property predicate values (`Type` normalization)

- `ZoneCardPropertyValueMatcher.IsMatch` backs `Equals`/`Not Equals`/`In` in both
  `ZoneCardRestrictionMatcher` and `LeaderTargetRestrictionMatcher`. `ZoneCardProperty.Type` is compared
  on an alphanumeric, case-insensitive form because card data authors the printed spelling
  (`"EX Character"`) while the engine resolves the enum name (`"ExCharacter"`) — comparing literally
  makes `Type Equals "EX Character"` unmatchable and `Type Not Equals "EX Character"` unconditionally
  true (that bug let N-018's "non-EX" K.O. and N-019/N-022's reveal filters accept EX cards). All other
  properties keep the plain comparison (honouring `IgnoreCase`).
- **`ZoneRestrictionMatchMode` is honoured per group**: `All` requires every predicate, `Any` requires
  one. Both matchers used to fold *every* restriction through `All(...)` (the `MatchMode` switch returned
  the same value twice), so an inline group such as N-019's "`[Sasuke Uchiha]` **or** a `[The Taka]` card"
  could never match through its second predicate — the reveal-summon silently took the failure branch and
  the card the player had just been shown was never summoned (`Execute_RevealFirst_MatchesPostCondition_WhenAnyPredicateOfAGroupMatches`
  pins it).

## Backend guidance

- `GameStateResponseMapper` builds available actions (`BuildLeaderAvailableActions`,
  `BuildEffectOptionLabel`, default `advance-phase`). Server stays authoritative:
  the client only mirrors what the response exposes.
- Be careful changing how availability evaluates “valid targets” for leader effects
  (`includeValidTargets` toggle in `EvaluateEffectAvailability`) — it can flip
  enabled/disabled and the expected disabled-reason strings asserted by server
  tests.
