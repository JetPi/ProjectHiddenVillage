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
- `disableInteractions=true` hides the whole overlay (`pointer-events-none
  opacity-0`) — used for hand reorder dragging.
- `hidePreviewButton=true` suppresses only the eye.
- **Targeting mode**: when a card is a valid target during battle/effect targeting,
  rows pass `isTargetCandidate` + `onChooseTarget`. Then hover reveals the eye AND
  a single **“Choose”** button (instead of the action list); clicking Choose calls
  `onChooseTarget` (= `onSelectAttackTarget(instanceId)`). Clicking the card itself
  no longer selects the target for battle/effect targeting. Summon-tribute target
  toggling still uses whole-card clicks.
- The overlay’s “reveal on hover” lives on the `card-overlay-controls` container
  (`group-hover:*` + transition), so any absolute children it contains inherit the
  reveal. Eye/buttons are hover-only by design.

## LeaderCard interaction controls (`components/ui/cards/LeaderCard.tsx`)

- Leader actions (non-Recovery) show as hover action buttons; the **Recovery**
  (`Flame`) button is split out of the option list and styled like the preview/eye
  chip (h-5/w-5, `bg-black/65 text-white`, border `white/35`), shown only on hover
  bottom-left, with distinct enabled (orange accent) vs disabled (`opacity-90`)
  classes via `ENABLED_RECOVERY_CLASSNAME`/`DISABLED_RECOVERY_CLASSNAME`.
- `disableInteractions` (targeting) suppresses preview + action overlays.

## Targeting-highlight CSS gotcha (`client/src/index.css`)

- `.battle-target-top > *`, `.battle-target-bottom > *` (and the leader variants)
  force every **direct child** to `position: relative; z-index: 2`.
- Because fragments flatten, overlay badges/controls are direct children of the
  card — without a fix they lose their `absolute` corners when the highlight
  appears.
- Keep them pinned by the higher-specificity overrides in `index.css`:
  `.battle-target-* > .card-overlay-badge, .battle-target-* >
  .card-overlay-controls { position: absolute; }`. If you add a new absolutely
  positioned direct child of a highlighted card, add it to that list.
