---
paths:
  - "client/src/**"
  - "server/**"
---

# Architecture & code structure

## Frontend layout

- Views: `client/src/views/` · UI components: `client/src/components/ui/` ·
  services/state: `client/src/services/`, `client/src/state/`.
- Game screen: `client/src/views/game/` — `GameView.tsx` composes; board lives in
  `components/`; hooks in `hooks/`; types in `types/` (barrel at `types/index.ts`);
  pure helpers in `utils/functions/`.
- **Animation has exactly one home**: `client/src/views/game/animation/` —
  `tuning.ts` (every duration, easing and stagger), `reducedMotion.ts` (the skip policy
  both the flights and the attack lunge obey), `flights.ts` (the overlay-copy
  primitives; every flight funnels through `animateOverlayCopy`), `flightRegistry.ts`
  (one owner per card, so a new flight takes over an old one rather than stacking and an
  interrupted flight cannot orphan its copy), `CardFlightLayer.tsx` +
  `cardFlightLayerMount.ts` (the single surface flights render into),
  `boardAnimationDirector.ts` (`noteFlight` / `whenIdle` / `resolveFlightsSettleAtMs` —
  what the phase-presentation acknowledgement drains on) and `runAttackLunge.ts`. Barrel:
  `animation/index.ts`. The arrow lives in `02-board-ui-hud.md`, the ack in
  `04-state-phase-effects.md`.
- Motion (`motion/react`) owns the declarative animations — hand-row presence/layout,
  the rested-card tilt (on a wrapper, so read a card's rotation from its nearest
  transformed ancestor) and card flips — while card flights stay WAAPI copies on the
  flight layer, because a copy must never compete with a real card for `transform`.

## Backend patterns

- Minimal API + EF mapping services (`CardMappingService`, `CardDataSourceMapper`).
- Keep domain-to-DTO separation (`Card` vs `CardDataSourceRecord`), and response
  DTOs separate from engine state. See `05-server-models-serialization.md` for the
  wire-format gotchas.

## Component refactoring patterns

- Move pure helpers/math **outside** component scopes; keep `useMemo` inside for
  Sets/lookups but extract mapping logic (e.g. `extractTargetIds`) to helpers.
- Extract big inline JSX/style/SVG blocks into standalone children/components.

## Barrels / import conventions (no cycles)

- Public barrels: `views/game/components/index.ts` and `views/game/types/index.ts`.
- External files import **from the barrel only**; never deep-import a module the
  barrel re-exports. Never import a barrel from inside the folder it aggregates.
- Game types live under `types/` subfolders each with its own barrel
  (`targeting/`, `game/`, `hub/`, `prompts/`, `hands/`, `card/`).

## Game board / zone components

- `GameZones.tsx` renders the board; shared helpers live in
  `utils/functions/gameState/gameZoneFunctions.ts` (highlight classes
  `battle-target-*`, `summon-target-*`, `toAnchorId`, target-set builders, attack-link
  geometry).
- Rows/zones: `BattleFieldRow` (character field), `ZoneCardSlots` (support slots),
  `BottomHandReorderRow` + `GameHandRow` (hand), `NonLeaderCardOverlay` (per-card
  hover actions/preview/HUD), `LeaderCard` (`components/ui/cards/`),
  `SidebarButtons`, `GamePhaseActionRow`/`GamePhaseIndicator`.

## Refs & React Compiler lint (strict-clean, no eslint-disables)

- `react-hooks/refs` forbids reading/forwarding refs during render.
- Pattern: owner keeps `useRef` storage and exposes **stable `RefCallback` mount
  handlers** (`useCallback`) that assign `.current` (e.g. GameView
  `setBoardZoneRef`, `setBottomHandRowRefs`). Children receive callbacks and attach
  them via `ref=`. Never pass `RefObject`s through props or read `.current` during
  render.
- `react-hooks/immutability`: don’t mutate through values returned from hooks —
  mount handlers that assign `ref.current` must live in the hook that owns the ref
  (`useGameRefs`).
- `react-hooks/exhaustive-deps` v7 treats anything destructured from a custom hook
  as non-stable: include refs/setters in dep arrays.
- Never call hooks from lowercase render functions (`renderBattlefieldRow`); pass
  values through data/args instead.

## Interaction-state boundaries on the board

- `IGameZonesProps` is **interaction-state-free**: it carries display data,
  hub/refs, connection flags, and the submit callbacks (`onSelectAction`,
  `onSelectSupportSlotForSet`, `onSelectAttackTarget`,
  `onConfirmSummonTargetSelection`, `onToggleTheme`, `onPassTurn`). GameZones,
  rows, and the sidebar read targeting/rested/attack-link slices straight from
  `gameUIStore`.
- Pure board utils (`gameZoneFunctions.ts`) receive values explicitly
  (`getCardsAndOptions(props, attackLink)`,
  `buildLeaderCardProps(…, { activeAttackLink, … })`); they never read interaction
  state out of component props.

## Cold-start anchors (current)

- Action/submit logic: `client/src/views/game/utils/functions/gameState/`
  (`submitMappedAction`, `trySubmitTargetedCardEffect`, `submitCardTargetSelection`,
  `submitSummonTargetSelection`, `submitSetSupportToSlot`, `handlePromptResolve`,
  `toggleSummonTargetSelection`). `GameView` keeps thin wrappers + a `gameActionDeps`
  object; side effects live in `hooks/GameView/effects/useGameViewSideEffects.ts`.
- Board UI flows through `GameZones.tsx`; interaction state reads come straight
  from `gameUIStore` (see `04-state-phase-effects.md`).
- Server available actions/leader actions: `GameStateResponseMapper` — a `static
  partial` facade in `server/Api/Services/Games/` split by concern
  (`GameStateResponseMapper.{Shared,PhaseActions,Zones,CardActions,HandActions,
  SupportActions,BattleActions,LeaderActions,EffectAvailability,EffectLabels}.cs`);
  the entry file only keeps `ToGameStateResponse` + prompt/attack projections,
  shared id comparison lives in `GameStatePlayerResolver`, and battle-action legality
  lives in `BattleActionRules` (shared with the engine — see
  `03-targeting-contract.md`). Key entry points:
  `BuildLeaderAvailableActions`, `BuildEffectOptionLabel`; the same
  `BuildCardAbilityOptions` builder publishes a battlefield character's own ability
  (see `03-targeting-contract.md`); target responses:
  `InMemoryGameInstanceRegistry.GetCardActionTargets` + `Build*CardActionTargets`
  (see `03-targeting-contract.md`). Leader “Recovery” = `EffectKind.Recovery`
  surfaced with label `"Recovery"`, gated by `ChakraRecoveryRules` (which the registry
  also uses to refuse a direct submit — see `03-targeting-contract.md`).
