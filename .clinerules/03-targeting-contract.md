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
- Every selection mode (battle/effect/summon/set-support) can be exited via the
  phase-row **Cancel** chip (`02-board-ui-hud.md`) or the sidebar `X`; both call
  the store’s `cancel*` actions and never submit to the hub.

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

## Server `GetCardActionTargets`

Returns `GameCardActionTargetsResponse` (`IsEnabled`, `DisabledReason`,
`ValidTargets`, `Minimum/Maximum/ExactTargetCount`, `AutoSelectAllValidTargets`)
for prefixes `summon-to-field`, `activate-support`, `battle-action`, and
`leader-effect` — implemented by `InMemoryGameInstanceRegistry.GetCardActionTargets`
+ its `Build*CardActionTargets` methods. `ExecuteCardAction` applies effects to the
request’s `SelectedTargets`; effects auto-resolve targets only when
`TargetRules.AutoSelectAllValidTargets` is set.

## Backend guidance

- `GameStateResponseMapper` builds available actions (`BuildLeaderAvailableActions`,
  `BuildEffectOptionLabel`, default `advance-phase`). Server stays authoritative:
  the client only mirrors what the response exposes.
- Be careful changing how availability evaluates “valid targets” for leader effects
  (`includeValidTargets` toggle in `EvaluateEffectAvailability`) — it can flip
  enabled/disabled and the expected disabled-reason strings asserted by server
  tests.
