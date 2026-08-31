# Phase Rules Implementation Plan

Last updated: 2026-08-30

## Progress Checklist

- [x] Draw rule baseline implemented server-side
- [x] MainPhase auto-end when no legal actions
- [x] EndStep automatic progression path
- [x] Initial backend battle-action execution route
- [x] Defender-only damage baseline enforcement
- [x] Opponent-turn support-area-only enforcement
- [x] Frontend no longer hides declare-attack-style actions
- [x] Explicit battle target contract required for attack actions
- [x] Full strict 4-step attack sequence windows (declare/effect/cut-in/damage)
- [x] Dedicated support cut-in timing windows tied to attack stage
- [x] LIFO multi-support chain assertions in attack windows
- [x] Frontend explicit sequence/prompt UX for battle stages

## 1. Source Requirements (from your spec)

### Draw phase
- On global turn 1 (the first player's first turn), the active player draws 1 card.
- On global turn 2 (the second player's first turn), the active player draws 2 cards.
- From global turn 3 onward, the active player draws 2 cards each turn.

### Main phase
- Normal summons are limited to 1 per turn and use the summon card (resting it consumes the summon).
- EX-characters and effect-triggered summons are not performed via the summon card and are not bound to the one-normal-summon limit.
- Characters cannot attack on the turn they are played unless they have Rush.

### Battle rules
- Characters have DMG and POW.
- DMG is used when attacking leaders.
- POW is used when attacking characters.
- To attack: rest the attacker.
- Character targets must be in Rest Mode.
- Leaders can be attacked even when Active.
- Defending character HP is reduced by attacker POW.
- Defending character at 0 HP is defeated and sent to trash.
- Only the defending character takes battle damage.
- Damage remains on the defending character until end of turn.

### Attack sequence (strict order)
1. Attack declaration
2. Effect declaration
3. Support cut-in
4. Damage step

### Support timing
- Supports playable on your turn can be played from Hand or Support Area (timing requirements still apply).
- Supports playable on opponent turn (including Quick) must be played from Support Area during their turn.
- Quick can be played in valid support cut-in response windows.

### Multiple support chain
- Resolve supports last-in-first-out (LIFO): most recently activated resolves first.

### Turn flow automation
- EndStep should not be user-button-driven.
- EndStep should progress automatically, similar to Draw phase automation.
- MainPhase should auto-progress only when absolutely no legal actions remain.

## 2. Decisions Confirmed During Implementation

- MainPhase auto-progresses only when no legal actions remain.
- Combat model is defender-only damage (no retaliation to attacker unless a separate effect says otherwise).
- Opponent-turn supports, including Quick, are strictly Support Area only (server-enforced).

## 3. Work Completed So Far

### Backend: phase and turn automation
- Implemented automatic EndStep completion through phase advancement logic.
- Added end-of-turn cleanup that resets temporary character damage and pending attack state.
- Added MainPhase auto-end behavior when active player has no legal actions.

### Backend: draw rules
- Added DrawPhase entry draw behavior based on active player turn count:
  - first turn for that player draws 1
  - second and later turns draw 2

### Backend: battle action execution
- Added backend support for battle-action execution routing.
- Added validation that attacker must be active (not rested).
- Added leader attack damage handling using DMG.
- Added character attack damage handling using POW.
- Added rested-target requirement for character defenders.
- Added defender KO handling to move defeated character to trash.
- Enforced defender-only damage model in this battle implementation.

### Backend: support timing enforcement
- On active player turn, support activation now permits source from hand or support area.
- On opponent turn, support activation requires support-area source.
- Added explicit rejection for opponent-turn hand-origin support activations.

### Frontend alignment
- Removed client-side filtering that hid declare-attack style actions.
- Included EndStep in auto-signal phase list so client does not rely on manual complete-end-step interactions.

### Validation done
- Targeted backend tests run and passing for updated phase/registry slices.
- Frontend build completed successfully.

## 4. Current Gaps (still to implement)

### Attack sequence orchestration
- Need explicit server-managed staged sequence with strict order:
  - Attack declaration
  - Effect declaration
  - Support cut-in
  - Damage step
- Current implementation now stages attack declaration, maps named sequence stages in API (`AttackDeclaration`, `EffectDeclaration`, `SupportCutIn`, `DamageStep`), defers damage to AttackResolution, and enforces stricter stage-specific legality (`WhenAttacking` in effect declaration stage, `Quick`/response timings in support cut-in stage). Remaining work is deeper chain-resolution assertions tied specifically to those stages.

### Battle targeting contract
- Need explicit target-selection contract for battle actions (not fallback behavior).
- Need stronger server validations tied to declared target context per stage.

### Support cut-in integration
- Dedicated cut-in response window integration with attack sequence stages is implemented.
- Valid support timing windows are now stage-gated server-side and in action mapping.

### Full chain-window behavior coverage
- Multi-support attack-window LIFO assertions are implemented with integration coverage using `GameState.EffectResolutionStack` and resolver order checks.

### UI prompt fidelity
- Need explicit frontend prompt and phase-sequence representation for:
  - attack declaration
  - effect declaration
  - support cut-in
  - damage step

## 5. Next Implementation Tranche

1. Introduce explicit attack sequence state model in runtime game state.
2. Require explicit declared target for battle actions.
3. Add server transitions and prompt windows for the exact 4-step attack sequence.
4. Wire support cut-in legality to sequence stage and turn ownership.
5. Expand backend tests for sequence order, timing windows, and LIFO chain resolution.
6. Update frontend prompt/phase rendering to match backend sequence windows.
7. Re-run targeted backend tests plus frontend build after tranche completion.

## 6. Working Reference Files

Backend core
- server/Engine/Services/GamePhaseStateService.cs
- server/Engine/Services/InMemoryGameInstanceRegistry.cs
- server/Api/Services/Games/GameStateResponseMapper.cs
- server/Models/Game/GameState.cs

Frontend core
- client/src/views/game/GameView.tsx
- client/src/views/game/hooks/useGameHubState.ts
- client/src/views/game/utils/functions/gameState/index.ts

Tests currently touched
- server/tests/ProjectHiddenVillage.Server.Tests/GamePhaseServiceTests.cs
- server/tests/ProjectHiddenVillage.Server.Tests/InMemoryGameInstanceRegistryTests.cs

## 7. Notes for Ongoing Work

- Keep backend authoritative for legality and timing windows.
- Keep frontend as a pure consumer of available actions and prompt state.
- Do not add local client phase mutation beyond existing auto-advance dispatch behavior.
- Maintain compatibility checks while replacing manual end-step interactions.
