---
paths:
  - "client/src/state/**"
  - "client/src/views/game/hooks/**"
  - "client/src/views/game/utils/functions/gameState/**"
  - "server/Engine/Services/GamePhaseStateService.cs"
  - "server/Engine/Services/InMemoryGameInstanceRegistry.cs"
  - "PHASE_RULES_IMPLEMENTATION_PLAN.md"
---

# Game-screen state, side effects & phase automation

## Two Zustand stores (`client/src/state/`)

- `gameHubStore` = server mirror (SignalR push). **Single writer for `gameState`**.
- `gameUIStore` = interaction state: `pendingCardTargeting`,
  `pendingSummonTargeting`, `pendingSetSupportCardInstanceId`,
  `optimisticRestedByInstanceId`, `activeAttackLink`,
  `lastSubmittedAttackSourceInstanceId`, `bottomHandFaceUpByInstanceId`,
  `isMulliganAnimationPending`. Targeting/summon transitions are store actions
  (`beginBattleTargeting`, `beginEffectTargeting`, `beginSummonTargeting`,
  `cancel*`, `toggleSummonTarget`, …).

## Self-healing instead of cleanup effects

- `gameUIStore` module subscribes to `gameHubStore` (`gameState`, `actionError`)
  and itself, then runs `pruneStaleGameUIState()` behind a `queueMicrotask` guard:
  clears stale targeting, reconciles optimistic resting, rolls back on
  `actionError`, clears `activeAttackLink` when `isAttackSequencePending` drops.
- Do **not** recreate per-render “clear stale pending state” effects.
- Zustand v5: `set()` notifies even when unchanged — guard writes in pruners
  (`recordsEqual`). Batch bursts via `queueMicrotask`. Use
  `useGameUIStore.getState().action()` in handlers, `useGameUIStore(selector)` for
  rendered values. Keep raw `RefObject`s out of stores.
- Store setters are updater-style (`Dispatch<SetStateAction<T>>`) so extracted
  utils keep receiving setters.

## REST vs hub

- TanStack Query caches REST only: loader seeds `cardQueryKeys.gameCards(code)` and
  `gameStateQueryKeys.byCode(code)` in `gameRouteHandlers.ts`.
  `useGameStateQuery(code, { enabled: false })` is a manual fallback used by
  `useGameHubState` only when hub (re)connect fails — never overwrite a live push.

## Phase auto-advance & hand animation gating

- `useAutoAdvancePhaseEffect` (`hooks/GameView/effects/useGameViewEffects.ts`) sends
  `{ intent: 'advance-phase' }` while the active player is in an `AUTO_SIGNAL_PHASES`
  phase with an enabled `advance-phase` action
  (DrawInitialHand / RefreshPhase / StartOfMainPhase / DrawPhase / AttackResolution /
  BattleEndStep / EndStep).
- The auto signal **waits until the deck→hand animation finishes** before
  dispatching: `useHandZoneAnimationEffects` stamps
  `animController.drawAnimationEndsAt` (now + stagger + fly + reveal + padding)
  whenever cards animate deck→hand (initial 5-card deal, mulligan re-draw, per-turn
  draw). Dispatch is re-armed until it actually fires — `lastAutoSignalKey` is
  committed only at dispatch time, so a phase never strands the player on a manual
  “Advance Phase” button.
- Tunables in that file: `DECK_TO_HAND_FLY_DURATION_MS`, `DRAW_ANIMATION_COMPLETE_PADDING_MS`,
  `AUTO_ADVANCE_RECHECK_MS`.
- `handlePromptResolve` (mulligan) animates hand→deck, waits for any in-flight
  deck→hand animation (`drawAnimationEndsAt`) before discarding, then submits
  `resolve-prompt`.
- Engine phase graph is authoritative
  (`server/Engine/Services/GamePhaseStateService.cs` + registry). Keep phase
  decisions server-side; the client only auto-signals phases the server exposes.

## Composition

- All game side effects run through
  `hooks/GameView/effects/useGameViewSideEffects.ts`
  (`useCardCatalogPreload`, `useHandZoneAnimationEffects`,
  `useAutoAdvancePhaseEffect`, `useBattlefieldCardReorderEffect`,
  `useGetMainPhaseActions`) in a fixed order — the animation effect runs before the
  auto-advance effect in the same commit.
