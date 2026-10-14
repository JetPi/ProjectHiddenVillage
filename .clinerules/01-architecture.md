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
  both the flights and the attack lunge obey), `flights.ts` (the flight primitives),
  `flightRegistry.ts` (one owner per card, so a new flight takes over an old one rather
  than stacking), `cardDepartures.ts` (which zone a recorded movement leaves for, and
  where that zone's pile slot is), `boardAnimationDirector.ts` (`noteFlight` / `whenIdle`
  / `resolveFlightsSettleAtMs` — what the phase-presentation acknowledgement drains on)
  and `runAttackLunge.ts`. Barrel: `animation/index.ts`. The arrow lives in
  `02-board-ui-hud.md`, the ack in `04-state-phase-effects.md`.
- **A flight moves the card itself** (the entity rule — every motion on the board):
  - the card *leaving* a zone flies as itself (`runElementToRectAnimation`): the hand card
    of a discard or a mulligan, a tribute material on its way to the trash, a card the
    field row is retiring;
  - the card *arriving* in a zone flies as itself (`runElementFromRectAnimation`,
    `runElementArrivalFromRectAnimation`): a draw landing in the hand, a reveal-summon
    landing on the field, the support card of a submit, the card that has just landed on
    top of a pile.
  There is a real element at **both** ends of every motion. Nothing is fabricated: an
  overlay copy cannot show a face-down card's back, and its cover-fit/rounded-8 styling
  never matched the card it landed on — that is the "duplicate card" and the "empty
  rounded box" entity flight removed. When a flight's source no longer exists, move the
  *destination* element from the captured rect instead of inventing a card.
- A flight marks the element it borrows with `data-card-traveling` and registers it with
  the director; transform/visibility/z-index are restored on settle **and** on cancel. A
  `data-card-traveling` left behind after the board settles means a card was abandoned
  mid-flight (transformed, or hidden by the frame the flight used to avoid flashing at its
  slot) — `gameview.multiplayer.board-animation.spec.ts` asserts none is left.
- **One card, one flight.** When the id of a card it has already flown appears in
  `animController.suppressedExitGhostInstanceIds`, whoever flies that card next must
  `delete` the id as it reads it, so a claim is consumed exactly once.
- **A card that travels away does not come back.** An *exit* flight (`runElementToRectAnimation`: a discard, a
  mulligan return, a tribute material, a field row retiring a card) ends with its card **hidden**, not restored to
  its resting spot. The element is still mounted when the flight settles - the state that removes it takes a
  round-trip - and restoring it painted the departed card back into the row it had just left, which is the "the
  old cards show up for a moment before the new ones" flash. The transform is still restored (the element's own
  state stays clean); only visibility is left hidden.
- **A hand card has no mount animation, and an arriving card is held until its flight takes it.** The hand row
  runs no `initial`/`animate`/`exit` on its cards: the flight that carries a card in (or out) is the only thing
  that may reveal it, because a mount fade running beside a flight was measured doing both at once - the card
  fading in at its resting spot (up to 223 ms fully opaque) while the flight also carried it from the deck, and
  starting to fly at 64% opacity (`plans/hand-deal-flicker.md`). The arrival is instead *held*: the hand-zone
  layout effect marks the arriving cards `data-card-arrival-pending` (which `index.css` renders unpaintable)
  before the browser paints them, and each flight removes its own marker in the same task that offsets the card.
  Two consequences to respect when touching this: the hold must be released on every path (including a skipped
  flight and the teardown), or a card is stranded invisible; and an arrival's destination is only a destination
  once it has a box - `runElementArrivalFromRectAnimation` waits for the box, because treating a mounted-but-laid
  out-less slot as ready is how an arrival ends up skipped, leaving the card to land unanimated.
- **Never lift a card with `position: fixed` inside the board.** Any ancestor carrying
  `transform`/`filter`/`perspective`/`will-change`/`contain` becomes the containing block,
  so a viewport-derived `left/top` is read in the wrong space — a dragged hand card was
  measured 566 px below and 645 px right of the pointer
  (`plans/board-position-animation-diagnosis.md`). Dragging belongs to Motion's `Reorder`
  (`dragListener={false}` + `useDragControls`), which owns the transform and keeps the card
  in its row.
- Motion (`motion/react`) owns the declarative animations — hand-row presence/layout and
  the drag, the rested-card tilt (on a wrapper, so read a card's rotation from its nearest
  transformed ancestor) and card flips — while the flights above are imperative WAAPI
  animations on the card's own element.

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
