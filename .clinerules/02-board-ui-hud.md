---
paths:
  - "client/src/views/game/components/**"
  - "client/src/components/ui/cards/**"
  - "client/src/components/ui/game/**"
  - "client/src/index.css"
  - "e2e/**battle-visuals*"
---

# Board / card UI: overlays, badges, highlight CSS

## CardOverlayBadge (canonical, `components/ui/cards/CardOverlayBadge.tsx`)

- Props: `value?`, `position?` (`top-left|top-right|bottom-left|bottom-right`,
  default `bottom-right`), `size?` (`sm|md|lg`), `className?`, `children?`.
- Renders `value` OR `children`; base class includes the marker
  `card-overlay-badge`; always absolutely positioned.
- Do **not** copy/duplicate this component or its types into views — import from
  `@/components/ui/cards` (barrel) and reuse.

## Stat HUD on cards (current values from the live instance)

- Battlefield characters (`zone === "battlefield"` in `NonLeaderCardOverlay`, when a
  `card` view model is provided): always-visible badges —
  - top-left: `currentDamage`,
  - top-right: `currentPower` (red span) `:` `currentHealth` (green span).
- Leader card: top-left `currentDamage`, top-right `currentPower`, bottom-right
  `currentLife` (life badge), matching the same red/green chip language.
- Source of the numbers is the view model (`currentPower`, `currentHealth`,
  `currentDamage`, …) — populated by the resolvers in
  `utils/functions/cards/index.ts` from the server payload (see
  `05-server-models-serialization.md` for the wire pipeline). Do not invent local
  stat math; prefer server-resolved values, falling back to catalog only.

## Per-card hover overlay (`NonLeaderCardOverlay`)

- Normal mode (not targeting): hover reveals the preview **eye** (top-right) plus
  the action-button list (or the “no actions” fallback / `mixed` bar).
- A card with **no** options shows the eye plus a single disabled **“No actions”**
  chip (`data-testid="card-no-actions-chip"`), styled by the same
  `ACTION_CHIP_CLASSNAME` as the action buttons so the empty state cannot drift from
  the populated one (the old “Actions pending backend wiring” text is gone).
- `disableInteractions=true` hides the whole overlay (`pointer-events-none
  opacity-0`) — used for hand reorder dragging.
- `hidePreviewButton=true` suppresses only the eye.
- The card-details side panel (`CardPreviewCard`, used by `NonLeaderCardOverlay` and
  `LeaderCard`) is a game-view scroll container: the panel that scrolls the
  header/art/stats/description carries the shared **`themed-scrollbar`** class
  (`index.css`) — the same idiom as the admin panes — so the game view never falls
  back to the chunky OS scrollbar. `e2e/gameview.spec.ts` pins `scrollbar-width:
  thin` on it. The trash viewer (`CardListOverlay`, below) uses the same class on
  its card grid.
- **Targeting mode**: when a card is a valid target during battle/effect targeting,
  rows pass `isTargetCandidate` + `onChooseTarget`. Then hover reveals the eye AND
  a single **“Choose”** button (instead of the action list); clicking Choose calls
  `onChooseTarget` (= `onSelectAttackTarget(instanceId)`). Clicking the card itself
  no longer selects the target. Summon-tribute targeting follows the same pattern:
  valid tribute cards receive `isSummonTargetCandidate` + `onToggleSummonTarget`,
  and hover shows a single **“Tribute”** toggle button (instead of the action
  list) — the card can only be toggled through that button, never by clicking the
  card as a whole. Multi-target effect picks (range supports) reuse that idiom with
  `isEffectTargetCandidate` + `isEffectTargetSelected` + `onToggleEffectTarget`: the
  hover button reads **“Select”** and flips to a filled amber **“Selected”**
  (`data-testid="effect-target-toggle"`), and selected candidates also get the amber
  `card-selection-tint`.
- The overlay’s “reveal on hover” lives on the `card-overlay-controls` container
  (`group-hover:*` + transition), so any absolute children it contains inherit the
  reveal. Eye/buttons are hover-only by design.

## Trash pile viewer (`CardListOverlay`)

- The trash slot is the one pile you can read back without hovering card by card: hovering it reveals
  an **eye** (`data-testid="trash-pile-viewer-button"`, same `card-overlay-controls` hover container /
  `bg-black/65`-`white/35` chip language as the preview and Recovery chips) that opens
  `CardListOverlay` (`components/ui/cards/`, re-exported from the barrel) listing that pile **newest
  first** — the server keeps `trash` in the order cards entered it, and the tile order is the pile
  order, so index 0 is the card the slot shows.
- `PlayPileZone` owns the hook: it renders the eye only for the trash label (`isTrashLabel`) and only
  when `onOpenTrashPile` is passed, so the deck slot and any read-only pile stay unclickable. `GameZones`
  keeps the open side in local state (`'top' | 'bottom'`) and feeds the overlay from
  `buildCardListEntries(player.trash, derivedGameState.cardById)` (helper in
  `utils/functions/cards/index.ts`) — the component itself carries no game state and submits nothing to
  the hub (backdrop click, the X chip and Escape all just close it).
- The modal is presentation only: `role="dialog"` inside a full-screen backdrop, portalled to
  `document.body` (the board forces `position: relative`/`overflow: visible` on its children, so an
  in-flow overlay would be clipped), reusing `Panel` + the prompt overlay's tile language. Clicking a
  tile opens the shared `CardPreviewCard` for that card, `themed-scrollbar` on the grid.
- Testids: `trash-pile-viewer-button`, `card-list-overlay` (+ `-items`, `-close-button`,
  `-empty-message`), `card-list-item-{instanceId}` carrying `data-card-definition-id` (the deterministic
  way to identify a pile card — never assert art URLs, see the art section above).
  The subtitle is **count-only** (`1 card` / `n cards`); the newest-first ordering hint was deliberately
  dropped from the copy, so never assert a `· most recent first` suffix (the pile order itself is still
  newest-first, see the pile bullet above).
  `e2e/gameview.multiplayer.actions.spec.ts` covers it on the tribute-summon flow (one card in the trash
  → open → `1 card` + one `T-120` tile → Escape closes; the spec also pins the absence of the dropped
  ordering suffix).

## Card art vs pointer interception (real art in tests)

- A **loaded** `<img>` card face can intercept pointer events aimed at hover controls
  (`card-overlay-controls`, e.g. the eye / “Open card details”). With the old placeholder art the
  request failed and `CardImage` rendered its fallback, which happened not to intercept — so a
  Playwright failure reporting `… intercepts pointer events` on a hover button is usually a *loaded
  art* problem, not a missing z-index. Check what `elementFromPoint` hits before touching layering.
- e2e blocks external art at the server (`CardArt__SourceHostAllowlist__0="e2e.invalid"` in
  `scripts/e2e-start-server.sh`), and specs must never assert a resolved art URL (the existing dump
  in `gameview.multiplayer.actions.spec.ts` says so explicitly — a load/failure race makes it flaky).
  Identify cards via `[data-testid="bottom-hand-card-{instanceId}"]` (hand) or
  `[data-testid="trash-pile-card"]` + `data-card-definition-id` (piles) instead
  (see `05-server-models-serialization.md`).

## Targeting-mode Cancel + phase action chips

- `GamePhaseActionRow` renders a **Cancel** chip next to the phase action chips
  whenever any selection mode is active (`pendingCardTargeting`, summon tribute,
  or effect multi-pick). Clicking it clears the mode through
  the store’s
  `cancelBattleTargeting`/`cancelSummonTargeting`/`cancelEffectTargeting`/
  `cancelSetSupportSelection` — client-only, no hub submit. There is also the small
  sidebar `X` (same actions). While an effect multi-pick is open the row also renders a
  **Confirm** chip (`data-testid="confirm-effect-target-selection-button"`), disabled
  until `canConfirmEffectTargetSelection` passes.
- The phase text itself comes from `getPhaseValue`:
  `Support Activated · Your Response` / `Support Activated · Opponent Response` while a MainPhase support
  activation waits for reactions (server flag `isSupportResponseWindowOpen`, see
  `03-targeting-contract.md`), plus the tribute/effect-selection values. Add new values to `PhaseValues`
  (`components/constants/gamePhaseActionRow.ts`) and give them a theme in `getPhaseThemeClasses` — the
  row’s chips and the phase banner share those classes.
- All chips in the row (actions + Cancel) share one base class constant
  (`phaseActionChipClassName`) incl. `enabled:hover:brightness-110` and the
  `phaseThemeClasses`. Do not give individual chips divergent hover styles.

## Rendering sharpness (avoid blurry re-rasterization)

- **Never apply a persistent fractional `scale` transform** to a card/layer that
  contains text or small art (e.g. `scale-[1.01]` for a “selected” pop). The GPU
  rasterizes the layer at a non-integer scale and everything inside — hover
  options, HUD badges — stays soft. Use non-transform cues instead (inner border +
  translucent tint `<div>`, rings), as done for selected tribute targets.
- **Do not keep idle GPU-layer promotion on heavily-downscaled small faces**
  (`[transform:translateZ(0)]`, `will-change-transform` on an `<img>`/static
  card). It causes double-sampling blur. Transient promotion during animations is
  fine.
- Keep `image-rendering: auto` (smooth) on painted card faces; never use
  `pixelated`/`crisp-edges` on small WebP art.
- **Bundled HUD faces** (Chakra/Summon/CardBackside) live in `client/src/assets`
  as `*webp` masters plus `*-hud.webp` variants. Size HUD variants to ≈**2× the
  measured displayed CSS box** (Lanczos), not arbitrary widths — e.g. the chakra
  slot measures ~35–37 CSS px, so `ChakraCard-hud.webp`/`CardBackside-hud.webp`
  are 70×98 / 70×97. Measure via a Playwright rect dump before resizing.
- The old `--resource-card-scale` transform on `ResourceSummonCard` was removed;
  the card fits its lane at layout size. Do not reintroduce fractional scaling to
  “fit” rail cards.


- Leader actions (non-Recovery) show as hover action buttons; the **Recovery**
  (`Flame`) button is split out of the option list and styled like the preview/eye
  chip (h-5/w-5, `bg-black/65 text-white`, border `white/35`), shown only on hover
  bottom-left, with distinct enabled (orange accent) vs disabled (`opacity-90`)
  classes via `ENABLED_RECOVERY_CLASSNAME`/`DISABLED_RECOVERY_CLASSNAME`.
- The leader also answers an effect selection prompt (N-013's freeze, which offers a Leader or a Character):
  while it is a candidate, `LeaderCard` shows the same **Select** chip the other board cards use
  (`data-testid="leader-effect-target-toggle"`, wired from `GameZones` → `buildLeaderCardProps` →
  `isEffectTargetCandidate`/`onToggleEffectTarget`), and the ability list + Recovery chip step aside
  (`isSoleAction`) so the pick is the only affordance. The `Choose` chip keeps precedence during an
  attack/effect targeting mode.
- `disableInteractions` (targeting) suppresses preview + action overlays.

## Rested vs exhausted on the board

- Rested = rotated `rotate-[14deg]` + `opacity-80 saturate-75`, driven by
  `isCardRestedState(card, optimisticRestedByInstanceId)`. The **leader** gets the same
  treatment via `buildLeaderCardProps({ isRested })` (mirrors `BattleFieldRow`, including the
  “don’t dim while the attack sequence is pending for the link source” rule); its rested flag
  must come from the server (`resolveLeaderCard` → `leader.isRested`), never hardcoded.
- `isExhausted` must **not** be OR-ed into the rested check anywhere: exhaustion means the card
  left play (exile pile), so it is not rendered as a rested card at all — an exiled card simply
  disappears from the field lookup. The same applies to `gameUIStore`’s optimistic-rest
  reconciliation.

## Revealed cards on the board (`isRevealed`)

- The deck slot carries the reveal hooks: `data-testid="deck-pile-card"` plus `data-revealed="true"` and
  `data-card-definition-id` (the revealed card's definition id, like the trash pile) while a reveal shows
  that card's face. `e2e/gameview.multiplayer.reveal-presentation.spec.ts` records those attributes with a
  page-side `MutationObserver` (`installDeckRevealObserver` in `e2e/helpers/multiplayer/flow.ts`) because a
  presentation only lasts `REVEAL_PRESENTATION_MS` (2 s) — polling after the action was submitted misses it.
- `PlayPileZone` renders the deck slot as a `FlippableCard` (`isFlipped` once that side's deck list carries a card with
  `isRevealed === true`), so a `Reveal First` effect flips the card over in place and it flips back when the server
  clears the flag (contract in `03-targeting-contract.md`). Both sides use the same lookup: the owner receives every
  deck card, the opponent only receives their revealed ones.
- The face comes from the catalog (`gameState.cardById`), exactly like the trash pile's top card — the deck branch of
  the zone mapper sends a base `CardInstanceResponse`, so no `displayName`/`power` is available there.
- The presentation is client-timed, not click-driven: the ack fires after `REVEAL_PRESENTATION_MS` (2000 ms,
  `views/game/utils/contants.ts`) through `useRevealPresentationAckEffect`, so the deck slot has to stay mounted (and
  keep its box) while the reveal lasts — the deck slot is also the origin of the deck→hand draw animation.
- A reveal of an **opponent's hand** card flips that one card in the top hand row (`GameView`'s `renderCard`): the
  payload carries the real identity plus `isRevealed`, while every concealed card still arrives as the concealed
  definition id — so no art is ever mounted for a hidden card.
- A reveal of a **support** card shows its face in `ZoneCardSlots` (`isShownFaceUp = card.isFaceUp || card.isRevealed`),
  the same flag that drops the concealed darkening / own-stripe overlays and enables the hover preview. The server
  keeps reporting a set support as `isFaceUp: false`, so `isRevealed` is the only signal that it was turned over.
- A reveal followed by a **summon** (N-019/N-022) flies the card out of the deck slot onto its owner's character
  field: `useRevealedCardSummonFlightEffect` remembers the revealed deck card (id + side) and, on the next pass,
  animates that card's freshly rendered battlefield element from the deck-slot rect (scale 0.92 → 1, the same
  invocation an explicit hand→field summon uses). The generic move-ghost effect cannot do this — a card drawn by the
  deck pile has no card-face snapshot — and because the flight is state-driven it also plays on the opponent's client.

## Support chain bubble (`SupportChainBubble`)

- Pops up in the top-right corner of the game view (`fixed right-2 top-2 z-40`, `pointer-events-none`, next to
  the action-error banner) from the **first** queued support activation
  (`shouldShowSupportChainBubble` = at least one entry), so a lone activation that only opened the reaction
  window is already spelled out while it waits for an answer. It disappears when the chain empties, because
  the entries leave `GameStateResponse.SupportChain`.
- The count chip pluralises (`1 activation` / `n activations`) and the `Resolves last in, first out` footer
  only renders for a real chain (≥2 entries).
- One row per activation in activation order (`#1` …), each with an actor chip (`You` / `Opponent`), the
  activating card's name, a `Next` chip on the newest entry (the stack resolves last in, first out),
  `⚡ Negates #n <card>` for a negate target, `→ Targets <card> (yours|theirs)` for board targets, and a rose
  `Will be negated by #n` note on entries a queued negate claims.
- The view model and every label are pure (`buildSupportChainView` in
  `views/game/utils/functions/helpers/index.ts`); the server is the only writer of the chain. Testids:
  `support-chain-bubble`, `support-chain-entry` (+ `data-entry-sequence`), `support-chain-negate-link`,
  `support-chain-count`. `e2e/gameview.multiplayer.support-target-visuals.spec.ts` pins both ends of the
  contract: the lone-entry pop while the window waits (`1 activation`) and the two-entry negate chain.
- `.support-chain-bubble-enter` (`index.css`) is a transient entrance animation only — no persistent
  transform, so the text inside stays crisp.

## Effect selection picker (`GamePromptOverlay`) + effect notice toast

- An effect selection prompt carries the cards' ids only; `buildPromptCandidateCards`
  (`views/game/utils/functions/prompts/index.ts`) resolves them from the prompt's `candidateZone` **and**
  `candidatePlayerId`: `Hand`/`Deck`/`Trash`/`ExileZone` are read straight off the matching player payload, so a
  "summon 1 Character from your trash" prompt renders real card faces (`GameView` passes `players`, not just the
  requesting player's hand/deck). The named zone is only a **hint**: the pool is that collection first, then the
  candidate player's remaining collections, because a node's rules can resolve candidates out of several zones at
  once (N-003's "trash **or** deck") while `CandidateZone` can name only one — each id in `prompt.options` is
  matched against the pool in the prompt's own order, so no offered card is dropped. Zones the board draws as
  selectable cards (`Hand`/`CharacterField`/`SupportZone`)
  keep the hover-Select flow instead (N-014's field destroy is answered by the card's own **Select** button);
  a trash/deck/exile pool opens this overlay.
- The picker is presentation-agnostic: tiles are `prompt-card-option-{instanceId}`, the option copy comes from
  `EFFECT_SELECTION_PROMPT_COPY` (keyed by the server's `selectionPromptKind` — `SummonFromZone` = "Choose a
  Character to Summon", `DestroyFromZone` = "Choose a Character to Destroy"), and the middle phase banner shows
  the matching `PhaseValues['select-prompt-*']` entry
  (`getPromptSelectionPhaseValue`). Adding a kind = one entry in each of those maps + the server enum member and
  `SELECTION_PROMPT_KIND_OPTIONS` (admin authoring). No server round-trip for wording.
- **`EffectNoticeBanner`** (rendered next to `SupportChainBubble`) is the non-blocking "the effect resolved but
  had nothing to act on" toast: `effect-notice-banner` / `effect-notice-message`, `role="status"`,
  `pointer-events-none`, top-left so it never fights the support-chain bubble (top-right) or the action-error
  banner (top-centre), auto-fading after ~4.2 s (`.effect-notice-enter` is a transient entrance animation only).
  It shows the newest `GameStateResponse.EffectNotices` entry that was **not** already in the payload when the
  board mounted, which is what keeps a mid-game reload from replaying old notices; the server republishes the same
  tail on every push, so the list is de-duplicated by `noticeId` (= the action-log entry id) rather than by
  clearing state. Never make it clickable or modal: it can arrive in the same push as a card animation.

## Targeting-highlight CSS gotcha (`client/src/index.css`)

- `.battle-target-top > *`, `.battle-target-bottom > *` (and the leader variants)
  force every **direct child** to `position: relative; z-index: 2`.
- Because fragments flatten, overlay badges/controls are direct children of the
  card — without a fix they lose their `absolute` corners when the highlight
  appears.
- Keep them pinned by the higher-specificity overrides in `index.css`:
  `.battle-target-* > .card-overlay-badge, .battle-target-* >
  .card-overlay-controls { position: absolute; }`. If you add a new absolutely
  positioned direct child of a highlighted card, add its marker class to that list
  (the concealed-support layers use `card-overlay-layer`, the amber selection tint
  uses `card-selection-tint`).
- `.battle-target-*` also forces `overflow: visible` on the card, which is what
  breaks **support slots**: a support-row card *is* one cell of the row's
  `grid-cols-5`, and its `overflow-hidden` is what keeps the cell's automatic
  minimum size at 0. With `visible` the cell jumps to the art's min-content box
  (measured ~112×155 instead of ~73×101 on a 1080p board), so every `1fr` track
  blows out, the row clips the oversized cells and the cards drift sideways.
  Guard the slot with `min-w-0 min-h-0` (`ZoneCardSlots`) so the highlight stays
  purely decorative; the empty placeholders next to it have no highlight of their
  own and only moved because they share the blown-out tracks.
  `e2e/gameview.multiplayer.support-target-visuals.spec.ts` measures all five
  slot rects before/after a negate target highlights and fails by ~40×53px per slot
  without the guard.
- The same hazard hits the **pile slots** from the other direction. Each pile zone is a grid item of
  its rail column (`grid-rows-[1fr_1fr]`, whose `1fr` rows carry an `auto` minimum), so once its clip
  is gone the freshly rendered deck/trash art blows the whole pile grid out to its min-content box —
  both slots grew from ~78×108 to ~100×274 on a 1080p board. `PlayPileZone`'s root therefore carries
  `min-w-0 min-h-0`. It is what stops the destination-side flight animations from flashing a giant
  card: `runRectToElementAnimation` calls `resolveOverflowAncestors`, which strips `overflow` from
  every clipping ancestor for the length of the animation (and leaves it stripped if the animated
  element is unmounted mid-flight, which made the inflated pile stick until the next layout).
  Measure it by un-clipping the zone with an injected `overflow: visible` — that alone reproduces the
  blowout, and re-adding `min-w-0 min-h-0` keeps both slots at their lane size. This is what made a
  **tribute summon flash a giant card**: the spurious inferred hand→trash flight (see
  `04-state-phase-effects.md`) animated the trash slot in place, which un-clipped the pile for the
  length of the animation.

## Attack-link arrow: anchors + arrowhead (measured live, never predicted)

- `react-xarrows` draws the dashed tail; the **arrowhead is ours**, and it is *measured
  from the tail the library actually drew* (`measureAttackLinkHead` in
  `AttackLinkArrow.tsx`): its tip is the tail path's end point, its rotation the
  path's end direction (sampled over the last head length). Never re-introduce the
  old predicted head (`resolveAttackHeadConfig` is gone): predicting from the anchors
  meant the head could disagree with the line, and dropping back to the library's own
  head flips `showHead`, which re-trims the tail path (so `head` is never cleared once
  measured).
- **Geometry is re-derived from the live elements on every layout sample**, inside
  `AttackLinkArrow` (`sampleAttackLinkLayout` → `resolveAttackLinkGeometry` from
  `utils/functions/gameState/gameZoneFunctions.ts`). GameZones' config only carries the
  anchor ids + the tuning constants (`IAttackLinkGeometryOptions`) — never finished
  anchors. A rested card keeps moving through its **CSS transition**, so anchors
  computed once per render are stale within a frame.
- **Every anchor on a tilted card needs a *two-component* visual-edge offset**, because
  react-xarrows anchors on the element's **bounding box**:
  - source (`getVerticalVisualEdgeOffset`): the bbox's top/bottom edge midpoint floats
    out at the rotated card's corner — and the attacker rests on declaration, so this
    hits *every* attack;
  - target/sweep (`getHorizontalVisualEdgeOffset`): the bbox's left/right edge midpoint
    needs both the inward x (the old x-only inset) **and** the y that moves it up to the
    tilted edge's midpoint — without the y the arrow meets the card level with its
    centre, i.e. `(w/2)·sin(angle)` (~10px on a rested 79px-wide card) *below* the
    visible edge midpoint.
  Both feed `withAnchorGap(side, gap, offset)` (one builder for all sides; zero offset
  for an untilted card, so the untilted look is unchanged).
- **Read the tilt from the `rotate` property, not `transform`**: Tailwind v4 emits
  `rotate-[14deg]` as the standalone `rotate` property, so
  `getComputedStyle(el).transform` is `"none"` while the card is visibly tilted.
  `getRotationRadians` reads `rotate` first and falls back to the transform matrix.
  (Missing this silently made every offset above a no-op.)
- The target's horizontal end anchor is only used when the source's anchor point lies
  **beyond** it (`resolveAttackAnchorSides` → `endAnchorSide`): react-xarrows draws the
  end tangent along `sign(endAnchorX - startAnchorX)`, so choosing the side from the card
  centres alone puts the tail on the *far* side of the target whenever the two cards
  overlap horizontally — the dashes then travel *out* of the card and any head fights the
  line. When neither side is approachable the **sweeping path** is used (same idiom as
  stacked cards), which always hooks into its anchor from outside.
- Head coordinates are **board-local** (`svgRect + pathPoint - boardRect`), because the
  board box is the offset parent. `x/y` is the head's **base**, one head length behind the
  path's end along the end direction, so the head's **tip lands on the end of the dashed
  tail**: react-xarrows stops the dashes up to `nonStrokeLen` (10) px before the anchor.
  Keep the head length ≥ the dash `nonStrokeLen`.
- **react-xarrows pitfalls that bit us (keep these in mind):**
  - its `he()` hook runs a `useLayoutEffect` *per prop* with `deps=[prop]` that calls
    `setState({...state})`, so every object literal passed as a prop (`dashness`,
    `headShape`, `passProps`, `divContainerProps`, …) must be referentially **stable**
    (module constants / `useMemo`), or each of our re-renders fires ~6 setStates;
  - a `setState` from *our* layout effect makes those nested updates, which together trip
    React's "Maximum update depth exceeded" — sample from `requestAnimationFrame`
    (`ATTACK_LINK_SETTLE_FRAMES`), never synchronously in the effect;
  - `useXarrow`/`Xwrapper` are **not** used: the wrapper updater fires from a dep-less
    layout effect and blows up the same way, and our own re-render already makes the
    library re-measure;
  - the overlay container must be **`position: absolute` inline** — `.game-board-spill > *`
    in `index.css` forces `position: relative` on every direct child of the board
    (unlayered CSS beats Tailwind's utilities layer), which made the overlay a grid item
    whose size fed back into the board layout.
- The dark glow (`ATTACK_ARROW_LINE_FILTER`) lives on the head's **`<svg>` root**, same
  constant as the tail's `passProps.style.filter`. A CSS filter on an SVG *child*
  (`<g>`/`<path>`) is clipped by its own tiny filter region, which silently kills the drop
  shadows — that is why the head looked flat against the glowing dashes.
- **The head's unit-space tip vertex is `(1, 0.5)`, not `(1, 0)`** (`ATTACK_ARROW_HEAD_PATH`).
  With only `rotate(a) scale(s)` the drawn head therefore lands `s/2` (~5px) to one side of
  the arrow's axis — visually "the arrow is offset/dropped from the line" while the
  axis-projection of its tip still sits on the tail's end. Keep the
  `translate(0 -0.5)` in the head `<g>` transform (SVG applies the rightmost transform
  first), so the tip maps to `(s, 0)` and rotates onto the line.
- Measure the arrow against the *drawn* geometry in tests: use
  `path.getPointAtLength(total).matrixTransform(path.getScreenCTM())` for the tail's end and
  `new DOMPoint(1, 0.5).matrixTransform(headGroup.getScreenCTM())` for the head's tip. Rect
  maths that repeats the placement formula (`headRect.left + cos·len`) shares its blind spot
  and reports 0 offset even when the head is visibly off (that is how the 5px slip above
  survived).
- **`position: absolute` must be inline** on that head `<svg>` too (same CSS override
  as above), or the head is drawn at its static grid position + offset (visibly
  off-target). Inline styles win.
- `e2e/gameview.multiplayer.battle-visuals.spec.ts` asserts the head's tip lands on the
  tail's end, the head follows the tail's direction, the tail travels *into* the target,
  the head points at the target (< 25°, loose now that the head follows the tail), and
  that **both ends sit the gap away from the rotated card surface** (source ≤ 11px vs
  ~15-17 at the bbox corner; target 13-19px vs ~28 when the bbox edge is used), so keep
  `data-testid="attack-link-head"` on it.
