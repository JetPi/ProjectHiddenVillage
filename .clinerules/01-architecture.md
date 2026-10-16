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
- **Card art has two sources, and `CardCatalogEntry.Image` says which.** An absolute
  http(s) URL is fetched and host-allowlisted as before; a `local:` reference
  (`CardArtSourceReference`, `local:card-art/<cardId>.webp`) names a master this server
  owns under `CardArt:UploadDirectory`, which `CardArtService` reads from disk instead of
  fetching. `TryResolveLocalPath` is the traversal guard - every segment is checked, the
  root must contain the result - and it has unit tests, because the value comes out of the
  database and is joined into a filesystem path.
- Writing art is admin-only and separate from reading it: `POST/DELETE /api/card-art/{cardId}`
  are `CardCatalogAdmin`, while `GET /api/card-art/{cardId}` stays anonymous because it is
  fetched by `<img src>`. `CardArtWriteService` streams a byte cap, refuses a content type it
  does not accept, identifies dimensions *before* decoding (a decompression bomb never
  allocates), re-encodes the master to WebP, writes it atomically, and clears the cached
  variants. Card id and art share one identity: an upload names its card id, and
  `CreateCardRequestValidator` refuses a `local:` reference that names a different card.
- `CardArtWriteLocks.ForCard` serialises a card's writers, and both the upload path and the
  variant build take it: the variant cache file names carry the card's updated timestamp,
  not the master's, so a build racing an upload could otherwise cache a variant decoded from
  the replaced master under a name that never expires.
- **Art is replaced, not re-uploaded in place.** `PUT /api/card/catalog/{cardId}/image`
  (admin-only, empty value clears) points the card at a master that `POST /api/card-art/{cardId}`
  already stored, and it *must* move `UpdatedAtUtc`: the response's image version comes from that
  timestamp, so without the move every client keeps painting the previous art from cache. Ownership
  is checked against the stored card id - the replacement request cannot see the id it will be applied
  to - which is why that rule lives in `CardMappingService` and not in the validator. The edit screen
  applies art immediately rather than with the effects save, and removing art clears the reference
  first and deletes the master second, so a half-failure never leaves a card pointing at a missing file.
- **Orphaned art is swept lazily, and the sweep rules are pure.** `CardArtOrphanSweeper` runs from a
  write, rate-limited by `CardArt:OrphanSweepIntervalMinutes` through a process-wide timestamp (a
  per-request field would sweep on every write, since the service is scoped). It collects masters no
  card references and cached variants of cards that no longer exist, both only past
  `CardArt:OrphanGraceMinutes` - the grace window is what stops it deleting the upload of a create
  request that has not landed yet. The decision logic is `CardArtOrphanPolicy` precisely so the rules
  are testable without a database or a filesystem, and the sweep cannot throw: housekeeping never takes
  a write down with it. There is still no hosted service in this codebase; a multi-instance deployment
  would need a real scheduler, which the interface says.
- **A `local:` reference is validated by shape, not by prefix.** `IsWellFormedLocalReference` pins
  `local:card-art/<safe card id>.webp` exactly, because a validator that only asked "does it start with
  `local:`" accepted `local:`, `local:card-art/` and `local:other/<id>.webp` (`CardImageUpdateTests`).
  Anything writing a new art path should use it rather than re-testing `IsLocal`.
- `/api/card/seed` carries the same `CardCatalogAdmin` claim as every other catalogue write: it writes
  the same table, so it is not exempt for having predated the authoring endpoints.
- **A master's path is derived from its reference, never guessed.** A reference is
  `local:card-art/<cardId>.webp` and `TryResolveLocalPath` resolves that *whole* relative path under the art
  root, so the `card-art/` segment is part of the contract: `BuildMasterPath` adds it, and the writer and the
  reader both go through it. Writing one level above it is silent - the upload succeeds, the row points at a
  file nothing can find, and `/api/card-art/{id}` just 404s into the placeholder. That is exactly what happened
  until `CardArtServiceTests` compared the two, so any new art path should go through these helpers rather than
  combining a root with `BuildFileName` by hand.
- **The master serves its own width.** A master is stored capped at `CardArtOptions.ResolveMasterWidth()` (the
  widest configured variant), so a request at or above that width is answered with the master itself instead of a
  derived cache file: the derivation had nothing to rescale, so it cost a duplicate file *and* a second q85 pass
  over the only bytes a browser ever sees at that width. `ResolveMasterWidth` lives on the options precisely so
  the write side and the read side cannot disagree about where the cap is - if they drifted, the read side would
  start dictating variants the write side had already stored.
- **A variant is collected once a newer version supersedes it.** The version in a variant's file name is the
  card's updated timestamp, so *any* card edit mints a new set of names; without this rule the previous sets were
  never read again and never removed either, which is an unbounded cache leak. `CardArtOrphanPolicy` collects a
  variant whose version parses as an older timestamp than the card's current one, and deliberately keeps a newer
  or unparseable version: a client pinned to a version this server does not recognise would otherwise have its
  art deleted and rebuilt on every sweep. Variants of deleted cards and unreferenced masters still need
  `OrphanGraceMinutes` to pass, which is what protects an upload whose create request has not landed.
- The admin create screen reuses the update screen rather than copying it:
  `useCardAdminEffectDraft` owns the editing state, `cardAdminEffectPayload` owns the
  validation rules, and `CardAdminEffectEditorBody` + `CardAdminEditorFooter` render them;
  the update screen adds the effects patch submit, the create screen adds identity and an
  image upload. `CreateCardRequestValidator` delegates the authoring half of a create to
  `UpdateCardEffectsRequestValidator`, so an effect rule cannot hold on an edit and be
  forgotten on a create.

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
- **A card in the air is above the UI, and its own `z-index` is never enough.** A hand card's
  element is a static `div` inside a `Reorder.Item` (a Motion transform = a stacking context of
  its own), and a card flying out of a board half is inside that half's `z-20` context - so in
  both cases the airborne rung belongs to the card **and its slot**, which is what
  `promoteAirborneLayer` in `animation/flights.ts` does, with the board half promoted for the
  duration of a flight by `[data-board-half]:has([data-card-traveling])` (see the ladder in
  `02-board-ui-hud.md`). Measured: without it a card set from hand was painted under the bottom
  hand row for the first frames of its flight.
- **A departure's hide must be healable *and* targeted.** An exit flight ends with its card
  hidden and marked `data-card-departed`, because the card has left and the state that removes
  the element has not landed yet. A hand row keeps it mounted for presence, so if the same
  instance is dealt straight back the element is reused and the hide must be cleared - but only
  for the cards the current push renders (`clearStaleDepartureHides(row, presentInstanceIds)`),
  otherwise the push that brings the replacement hand un-hides exactly the cards that just flew
  out. Both halves of that rule are load-bearing; measured both ways.

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
