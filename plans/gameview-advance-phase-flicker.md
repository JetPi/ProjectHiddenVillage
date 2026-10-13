# Game view: no `Advance Phase` chip, frozen action chips through auto phases

## Problem

While the engine walks the non-interactive phases of a turn, the action area displays a chip labelled
**Advance Phase** that appears and disappears on every phase hop, so the row reads as a flickering
"Pass Turn → Advance Phase → Pass Turn" stutter. `Advance Phase` must never be shown.

## Decided behaviour

The chip **must not disappear**. The row keeps displaying whatever chips it showed at the last
interactive phase and simply holds them, unchanged, for the whole auto-advance chain, until the next
interactive phase swaps in its own chip set. The phase banner is the only thing that changes during
the transition.

## Root cause

1. The chip is a global action chip rendered by
   [`GamePhaseActionRow`](client/src/views/game/components/GamePhaseActionRow.tsx:47). The row hides
   only `declare-action`, so `advance-phase` renders and its `label` is printed at
   [line 70](client/src/views/game/components/GamePhaseActionRow.tsx:70).
2. The server publishes it as an engine-internal affordance:
   [`GameStateResponseMapper.PhaseActions.cs`](server/Api/Services/Games/GameStateResponseMapper.PhaseActions.cs:136)
   adds `advance-phase` / `Advance Phase` whenever the active player has no phase options, which is
   exactly the set of non-interactive phases.
3. The client already drives those phases itself:
   [`useAutoAdvancePhaseEffect`](client/src/views/game/hooks/GameView/effects/useGameViewEffects.ts:862)
   submits `{ intent: 'advance-phase' }` while the phase is in
   [`AUTO_SIGNAL_PHASES`](client/src/views/game/hooks/GameView/effects/useGameViewEffects.ts:26),
   deliberately waiting for the deck-to-hand draw animation
   ([`drawAnimationEndsAt`](client/src/views/game/hooks/GameView/effects/useGameViewEffects.ts:911))
   plus `AUTO_ADVANCE_RECHECK_MS` (80 ms).
4. Each hop therefore replaces the previous phase's chips with the single `Advance Phase` chip and
   then removes the strip again. The strip animates width and opacity over 300 ms
   ([line 54](client/src/views/game/components/GamePhaseActionRow.tsx:54)), so both edges are visible,
   and `isActionPending` toggling on every signal re-styles the chips at the same cadence.
5. Two supporting flaps: the sidebar pass button treats `advance-phase` as pass-like
   ([`usePassLikeAction`](client/src/views/game/hooks/GameView/memos/usePassLikeAction.ts:8)) and so
   toggles enabled every hop, and the driver's retry budget is bounded
   (`AUTO_ADVANCE_MAX_RETRIES = 3`), which is why the chip is currently also the only recovery path.

## Plan

### 1. One home for the ownership rule

Create `client/src/views/game/utils/functions/gameState/autoAdvanceOwnership.ts` exporting:

- `SYSTEM_ADVANCED_PHASES` - the phase allow-list moved out of `useGameViewEffects.ts` (same members
  as today's `AUTO_SIGNAL_PHASES`), so the row and the driver cannot disagree.
- `isAutoAdvanceOwnedSnapshot({ isConnected, isActivePlayer, hasEnabledAdvancePhaseAction, hasPendingPrompt, phase })`
  - pure, no React imports, true only when connected, the local user is the active player, an enabled
    `advance-phase` is published, no prompt is pending, and the phase is in `SYSTEM_ADVANCED_PHASES`.

### 2. The row freezes instead of collapsing

- New hook `client/src/views/game/hooks/GameView/memos/useRetainedPhaseActionChips.ts` (latch in a
  ref): on every **non-owned** snapshot it stores the current chip list when that list is non-empty;
  on an owned snapshot it returns the stored list. It returns `{ chips, isFrozen }`.
- [`GamePhaseActionRow.tsx`](client/src/views/game/components/GamePhaseActionRow.tsx:47) filters
  `advance-phase` out of the incoming actions (like `declare-action`) so it can never render, feeds
  `chips` into the existing strip and derives `hasOptions` from `chips.length`, so the open/close
  transition never runs during an auto chain and the previous chips stay painted.
- While `isFrozen` the chips stay visually as they were and are inert (no click, no hover
  brightening) so a stale action from a finished phase can never be submitted against a moved phase.
- The latch is left untouched by auto phases, so it only ever changes at an interactive phase, and it
  is naturally empty for the opening deal (nothing to retain until the first MainPhase).
- Reset the latch when the game ends or the view unmounts.

### 3. Sidebar keeps its last interactive state too

Apply the same principle to the sidebar buttons: while the snapshot is auto-advance owned, their
enabled/disabled state is held at the last interactive value instead of being recomputed from the
phase-level payload, so the pass, undo and log buttons stop blinking on every hop. The pass button
keeps its `Do Nothing / Pass` tooltip and only submits when it is not frozen.

### 4. Driver hardening

In [`useAutoAdvancePhaseEffect`](client/src/views/game/hooks/GameView/effects/useGameViewEffects.ts:815),
because the chip is no longer a recovery path:

- Replace the hard `AUTO_ADVANCE_MAX_RETRIES` stop with a slow snapshot-scoped re-arm
  (`AUTO_ADVANCE_RETRY_DELAY_MS`) that only ends when the phase snapshot moves, a prompt opens, the
  game is over, an action is pending, the action is no longer offered, or the client disconnects.
- Keep every invariant from [`04-state-phase-effects.md`](.clinerules/04-state-phase-effects.md:68):
  lifecycle in refs, a pending timer never cancelled by a re-run, every timer fire re-reads the live
  store, the timer cleared only on unmount.

### 5. Interactive windows stay out of auto-advance

`isAutoAdvanceOwnedSnapshot` is the single gate. `AttackDeclaration`, `MainPhase` and `ActionStep` are
not in `SYSTEM_ADVANCED_PHASES`, so the optional On-Attack choices and the pass/end-turn chips keep
rendering live and the driver never pre-empts them.

### 6. Optional server tidy-up

Make [`AddDefaultAdvancePhaseAction`](server/Api/Services/Games/GameStateResponseMapper.PhaseActions.cs:126)
skip adding the system action when other actions were already published, so the optional On-Attack
window no longer offers `Advance Phase` at all (it currently can be clicked to skip the question and
land in the effectively unused `BlockerDeclaration` phase,
[`GamePhaseStateService.cs`](server/Engine/Services/GamePhaseStateService.cs:20)). The action must keep
being published in the pure auto phases, since the driver still submits it. This step can be dropped
to keep the change client-only, because the client filter already hides it there.

### 7. Verification

- No client unit-test runner exists ([`client/package.json`](client/package.json:6) has only
  `dev`/`build`/`typecheck`/`lint`), so the predicate and the latch stay pure/testable modules and are
  exercised through the e2e suite.
- New e2e spec: drive a full turn transition and watch the DOM with the `MutationObserver` pattern
  used by [`gameview.multiplayer.reveal-presentation.spec.ts`](e2e/gameview.multiplayer.reveal-presentation.spec.ts:1),
  asserting that no element whose text is `Advance Phase` ever mounts, that the action-chip text set
  does not change between the last interactive phase and the next one, and that the phase banner
  walks `EndStep → StartOfMainPhase → DrawPhase → RefreshPhase → MainPhase`.
- Run `npm run typecheck`, `npm run lint`, and the targeted specs
  [`gameview.multiplayer.actions.spec.ts`](e2e/gameview.multiplayer.actions.spec.ts:1),
  [`gameview.multiplayer.attack-sequence.spec.ts`](e2e/gameview.multiplayer.attack-sequence.spec.ts:1),
  [`gameview.multiplayer.prompts.spec.ts`](e2e/gameview.multiplayer.prompts.spec.ts:1); run the server
  tests if step 6 lands.
- e2e helpers keep submitting `advance-phase` through the hub API (for example
  [`progressToNextDecisionWindow`](e2e/helpers/multiplayer/flow.ts:164)), so the action must stay in
  the payload; only its rendering changes.

### 8. Documentation

Update [`04-state-phase-effects.md`](.clinerules/04-state-phase-effects.md:54) (driver policy,
unbounded re-arm, ownership predicate),
[`02-board-ui-hud.md`](.clinerules/02-board-ui-hud.md:112) (the row freezes on the last interactive
chip set during auto phases; no system chip is ever rendered) and
[`03-targeting-contract.md`](.clinerules/03-targeting-contract.md:20) (`advance-phase` is
system-internal and never user-facing).

## Status: implemented

Everything above landed, with two adjustments worth remembering:

1. **The unbounded re-check exposed a stranding bug that had to be fixed with it.** The driver arms one
   timer at a time, and the old code dropped a previous snapshot's timer as a side effect of resetting its
   retry budget (`abandonPendingSignal`). Removing the budget removed that clear, so a retry armed for
   `StartOfMainPhase` survived into the `DrawPhase` snapshot, passed the "a timer is already armed" guard
   (the new snapshot armed nothing) and then discarded itself on the snapshot check - leaving the phase with
   no driver at all. `advanceSignalKeyRef` now drops the previous snapshot's timer explicitly, and
   `e2e/gameview.multiplayer.phase-transition.spec.ts` pins it.
2. **The chip latch lives in `gameUIStore`, not in a component ref.** `react-hooks/refs` (eslint v7)
   rejects render-phase ref access, so the latch is store state written synchronously from the hub-store
   subscription (`syncAutoAdvanceHudLatch`) and read through
   `client/src/views/game/hooks/GameView/memos/useRetainedInteractiveActions.ts`.

Gates: `npm run typecheck` and `npm run lint` clean; e2e green on the new phase-transition spec plus
`gameview.multiplayer.actions`, `gameview.multiplayer.prompts`, `gameview.multiplayer.attack-sequence`,
`gameview.multiplayer.leader-effects`, `gameview.multiplayer.leader-recovery` and `gameview.spec.ts`.
