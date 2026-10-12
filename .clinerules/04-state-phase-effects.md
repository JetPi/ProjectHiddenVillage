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
  `pendingSummonTargeting`, `pendingEffectTargeting`,
  `pendingSetSupportCardInstanceId`,
  `optimisticRestedByInstanceId`, `activeAttackLink`,
  `lastSubmittedAttackSourceInstanceId`, `bottomHandFaceUpByInstanceId`,
  `isMulliganAnimationPending`. Targeting/summon transitions are store actions
  (`beginBattleTargeting`, `beginEffectTargeting`, `beginSummonTargeting`,
  `beginEffectMultiTargeting`, `cancel*`, `toggleSummonTarget`/`toggleEffectTarget`, …).

## Self-healing instead of cleanup effects

- `gameUIStore` module subscribes to `gameHubStore` (`gameState`, `actionError`)
  and itself, then runs `pruneStaleGameUIState()` behind a `queueMicrotask` guard:
  clears stale targeting, reconciles optimistic resting, rolls back on
  `actionError`, clears `activeAttackLink` when `isAttackSequencePending` drops.
- Do **not** recreate per-render “clear stale pending state” effects.
- When the game is over (`gameState.gameOutcome`), the pruner clears every pending
  selection (battle/effect targeting, summon tributes, multi-target picks and the picked
  prompt candidate), the attack link and the optimistic rest, then
  returns — no action is published afterwards, so nothing else would ever drop them.
  **Guard every one of those writes** (`if (ui.x) { ui.setX(null) }`): the store
  subscribes to itself, and an unconditional `set` re-schedules the pruner forever —
  a microtask loop that starves the renderer (the page stops responding to anything,
  so a Playwright assertion on it just times out).
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

## Engine-owned phase transitions & the presentation acknowledgement

The engine drives the non-interactive phases itself now (`GamePhaseAutomation:Enabled`), and it stops on
each transition until **every connected client** has confirmed its board finished showing it. The client's
job is therefore no longer to advance anything: it is to *present* the transition and *acknowledge* it.

- The engine publishes the receipt as `pendingPresentation` (`{ presentationId, phase, kind, turnNumber,
  requiredAckPlayerIds, acknowledgedPlayerIds }`) and **withholds every other mutation** while it is
  outstanding (`GamesHub.ExecuteAuthorizedGameMutation` rejects with `Game.PhasePresentation.Pending`). The
  acknowledgement is the only call left, and it has its own hub path.
- `usePhasePresentationAckEffect` (`hooks/GameView/effects/useGameViewEffects.ts`) answers it:
  `isPresentationAwaitingAck` (`utils/functions/gameState/phasePresentation.ts`) decides whether **this**
  client still owes an ack (listed in `requiredAckPlayerIds`, not yet in `acknowledgedPlayerIds`), and the
  ack is sent once the board has actually finished animating.
- **The ack never goes through `submitHubIntent`.** It is not a player action: `acknowledgePhasePresentation`
  (returned by `useGameHubState`, implemented in `gameHubApi`) invokes the hub, applies the returned state
  with `setGameState` and never touches `isActionPending` - so the buttons, the prompt UI and the phase row
  are not restyled by it. A refusal (a superseded/expired presentation, the game ending) is logged and
  followed by the coalesced state refresh, never shown as a player error.
- **The ack waits on the board, not on a guessed delay.** `animController.animationEndsAtByKey` is the
  animation registry (`noteAnimation(key, endsAt)` on `useGameAnimationController`): the deck→hand draw, the
  hand→pile discard and every card ghost flight register their real end timestamp, and
  `resolvePresentationAckAtMs` = `min(hardCap, max(seenAt + kindMinimum, animationsSettleAt))`. Per-kind
  minimums (`InitialDeal` 900 ms, `Ready`/`Draw`/`Damage`/`BattleEnd` 700 ms, `TurnEnd` 400 ms, unknown
  kinds 600 ms) keep a transition nobody animates readable; `PHASE_PRESENTATION_HARD_CAP_MS` (2.5 s) is the
  backstop so a stuck flight can never hold the table (the server's own `PresentationAckTimeoutMs` watchdog
  is the second line of defence - a timeout resumes the drain and notifies the clients from outside any hub
  call).
- Invariants to keep:
  - the timer re-reads the live store before acking and only answers **the presentation it was armed for**;
    a newer presentation is a new effect run, never an ack for a receipt the server has already replaced;
  - while a submit of this client's own is in flight (`isActionPending`) the ack re-arms instead of racing
    it - the engine refuses other mutations then, but the in-flight submit still owns the board;
  - a failed or refused ack re-arms every `PHASE_PRESENTATION_RETRY_MS` (250 ms) while the same receipt is
    still pending, so one dropped call cannot park the table;
  - the timer is cancelled on unmount and whenever the receipt/presenter changes.
- `handlePromptResolve` (mulligan) still animates hand→deck and waits for any in-flight deck→hand animation
  (`drawAnimationEndsAt`) before submitting `resolve-prompt`.
- A phase presentation is **not** a prompt: it never enters `pendingPrompt`, the `resolve-prompt:*` action
  list or the pickers. `GamePrompt` means "you owe the engine a decision"; this means "you owe the engine an
  animation receipt".

## Frozen HUD during an engine transition

- The engine no longer publishes a system `advance-phase` action for these games at all
  (`AddDefaultAdvancePhaseAction` returns early when the automation is on), so there is nothing to flash: a
  row that renders the payload verbatim simply goes empty between two engine-driven phases. It must not -
  **the row holds its last interactive content until the next interactive phase arrives.**
  `resolvePhaseActionChips` (`utils/functions/gameState/phaseActionChips.ts`) still drops `declare-action`
  and `advance-phase` as a safety net for a table whose automation is off.
- `gameUIStore` latches `retainedInteractiveAvailableActions` and `retainedIsActionBlocked` at every
  snapshot that is not mid-transition (`syncPhasePresentationHudLatch`, wired to the hub-store
  subscription) plus `isPhasePresentationPending` (= `Boolean(gameState.pendingPresentation)`);
  `GamePhaseActionRow` paints the latched list whenever it is set, so the strip's open/close transition
  never runs mid-chain and the chips keep both their text and their enabled/disabled look (the latch
  carries that state, because the acknowledgement and the state it pushes would otherwise restyle live
  chips).
- Held chips belong to a phase that already moved, so they are **inert** while frozen
  (`pointer-events-none` + `aria-disabled` + `tabIndex={-1}`, no click) - never `disabled`, which would
  visibly dim them. `SideBarButtons` reads the same latch (`isActionBlocked`, `isPresentationPending`) so
  the pass/undo/log buttons stop blinking during a transition.
- The latch is written **synchronously** in the hub-store subscription, never in a microtask or during
  render: the latch listener is registered before React's `useSyncExternalStore` one, so the store already
  holds it when React reads the pushed state. A deferred write would render one frame of the unlatched
  list, which is the flicker this removes. It is cleared on game over and on a session/game-id change, and
  the opening deal has nothing latched until the first interactive phase.
- `react-hooks/refs` (eslint) forbids render-phase ref access, so the latch cannot live in a component
  ref - it is store state read through `useRetainedPhaseActionSource` / `useRetainedActionBlocked`.
- The same effect owns the **inferred** hand→trash flight (the safety net around the prompt-driven
  discard, which animates the real hand element itself in `usePromptSelectionSubmitEffect`): a card
  that left the hand is flown into the trash only when its instance id is **in the trash** in the new
  payload. Matching on the trash's contents is what keeps a summon from being mis-attributed — a
  tribute summon removes the *played* card from the hand and grows the trash from the **tribute
  material** leaving the field, and the old hand-removal-vs-trash-count delta paired those two, so
  every tribute flew the trash slot in from the hand (which also flashed the pile's giant-card layout
  blowout described in `02-board-ui-hud.md`).
- Tunables in that file: `DECK_TO_HAND_FLY_DURATION_MS`, `DRAW_ANIMATION_COMPLETE_PADDING_MS`; the ack
  cadence and per-kind windows live in `utils/functions/gameState/phasePresentation.ts`
  (`PHASE_PRESENTATION_RETRY_MS`, `PHASE_PRESENTATION_MINIMUM_MS`, `PHASE_PRESENTATION_HARD_CAP_MS`).
- `handlePromptResolve` (mulligan) animates hand→deck, waits for any in-flight
  deck→hand animation (`drawAnimationEndsAt`) before discarding, then submits
  `resolve-prompt`.
- Engine phase graph is authoritative
  (`server/Engine/Services/GamePhaseStateService.cs` + registry). Keep phase
  decisions server-side; the client only auto-signals phases the server exposes.

## Main-phase auto-end, rest/stand & damage resets

- `AutoAdvanceMainPhaseIfNoLegalActions` (registry; called after phase/pass/action mutations)
  ends the MainPhase when `HasAnyMainPhaseLegalAction` is false. That check calls
  `BattleActionRules.CanDeclareBattleAction` for battlefield cards **and** the leader, then
  falls back to hand actions — so the auto-skip and the published availability cannot
  disagree (a publicly disabled `Battle` chip never counts as a legal action).
  - **Known gap, deliberately not addressed yet:** support-zone activations are not modelled,
    so a player whose only play is an unused support in the support zone can still be
    auto-ended. Closing it means lifting the mapper's support-timing evaluation into shared
    code.
- Rest/stand: the attacker rests **once**, at declaration
  (`InMemoryGameInstanceRegistry` pays it as the attack's cost). Nothing downstream re-rests it — not the
  when-attacking chains, not the support cut-in, not `InterruptAttackEffect` (which used to, via the removed
  `EnsurePendingAttackAttackerRemainsRested`) — so an effect that stands the attacker back up keeps it
  standing, and an interrupted attack leaves it rested purely because the declaration rested it. The one other
  place that rests a card is `ExecuteLeaderEffectAction`: a leader's `Recovery` rests the leader once the
  ability's effect executed (see `03-targeting-contract.md`).
  `OnEnterRefreshPhase` re-readies the active player's battlefield cards **and their leader**. Because that
  happens immediately before the MainPhase, “my leader already attacked” is never expressible as a rested
  leader at MainPhase entry — use a cannot-attack effect if a test needs “this card cannot attack”.
- Damage resets: `CompleteEndStep` → `ResetTemporaryCharacterDamage` clears battlefield
  `CurrentHealth` at the turn boundary (character health = effective max health − damage taken
  this turn). **Leader life is never reset** — only damage and card effects change
  `CurrentLife`.
- Exhaustion means the card left play (exile zone) and is never a “rested” state; leaders can
  never be exhausted. The `ZoneCardProperty.IsExhausted` predicate was removed — do not re-add
  it (use a zone predicate instead).
- Client: optimistic rest is keyed by instance id (`optimisticRestedByInstanceId`), so it
  covers leaders too; a card that leaves play drops out of the character-field lookup rather
  than reading as rested.

## Composition

- All game side effects run through
  `hooks/GameView/effects/useGameViewSideEffects.ts`
  (`useCardCatalogPreload`, `useHandZoneAnimationEffects`, `useCardMoveGhostAnimationEffect`,
  `usePhasePresentationAckEffect`, `useBattlefieldCardReorderEffect`,
  `useGetMainPhaseActions`) in a fixed order — the animation effect runs before the
  acknowledgement effect in the same commit, which is what lets the ack read the deadlines that effect
  just registered for this push.
- `useCardMoveGhostAnimationEffect` owns the battlefield/hand → trash and battlefield → hand flights: it
  snapshots every rendered card face (rect + art + zone, keyed by instance id) on each render, and on the
  next one flies a `data-card-ghost` copy from that snapshot to the zone the card moved to (trash pile, or
  its freshly rendered hand card for bounce effects like N-020). Both the geometry *and* the "left its zone"
  test come from the previous snapshot — the state push that moved the card already re-rendered the board, so
  the real element is gone (or already sitting in its new zone) by the time the effect runs. Tribute summons
  claim their ids in `animController.suppressedExitGhostInstanceIds`, so a card is never animated twice.

## Deferred (prompted) target selection — engine suspension

- `EffectSpec.SelectionTiming` = `Prompted` defers a node's target choice to *execution* time, so an earlier
  step of the same chain can change the candidate pool first ("draw 1 card, then place 1 card from your hand
  on top of your deck"). `Upfront` (default) is the old behaviour — nothing changes unless a node opts in.
- `GameSequentialEffectExecutor.RunNodes` checks it **before** `ResolveStepTargets`/`CanExecute`: it resolves
  the node's candidates from the rules (freezing them into `GamePrompt.Options`), enqueues a
  `GamePromptType.Effect` prompt, records a `PendingEffectContinuation` **on the prompt**, and returns — the
  chain suspends and the game is locked (existing pending-prompt guards already block actions/advance).
- `registry.ResolvePrompt(..., sequentialEffectExecutor)` captures the prompt *before* resolving (the
  continuation lives on it), then calls `IGameSequentialEffectExecutor.Resume`, which rebuilds the context
  with the answer as `SelectedTargets` and re-enters at `ResumeNodeId`. The resumed node executes through its
  normal path, so move/stat invariants and mutation emission are not duplicated anywhere.
- Prompted nodes must not be in an `AtomicChain` (atomic chains pre-plan and cannot suspend).
- Cable/UI: the prompt carries `SelectionPromptKind` (client-owned copy, `EFFECT_SELECTION_PROMPT_COPY`),
  `CandidateZone`/`CandidatePlayerId` (which collection to render) and min/max counts. Nothing is published
  up front for a prompted node (`ResolveValidTargetsForResponse` returns `[]`), so the client keeps
  auto-submitting and the engine prompts — otherwise the player would pick *before* the draw.
- `GameSequentialEffectExecutor.ResolveEntryNodeId` now honours `__abilityKey`
  (`ReactiveEffectExecutionConstants.AbilityKeyArgument`): a card with several abilities starts at the
  *requested* ability's node. The action that started the execution names it —
  `leader-effect:{instanceId}:{effectKey}` for a leader, `character-ability:{instanceId}:{effectKey}` for a
  battlefield card. Previously it always walked the first non-subordinate node, so a card's second ability
  executed the first ability's chain (N-012's `draw-n-place-card` never ran).
- `MoveCardEffect` no longer auto-consumes a card it just drew (the old `selfSuppliedTargets` fallback):
  authoring "draw then place" is two chained nodes, the second `Prompted`.
- `RuntimeEffects.SearchCard` is implemented (`SearchCardEffect`, prompted selection from the deck) —
  configured with the same `MoveCardActionSpec` payload plus `SearchRevealSelection` / `SearchShuffleAfter`.

