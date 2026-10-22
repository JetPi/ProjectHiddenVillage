# Board UI: motion hardening (layout thrash, re-render churn, overlay transitions)

## What changed

- `views/game/animation/tuning.ts`: added `BOARD_LAYOUT_SPRING`, `BOARD_ROTATE_SPRING`,
  `OVERLAY_ENTER_SPRING`, `OVERLAY_EXIT_TRANSITION` (`satisfies Transition`), so every board motion
  shares one spring language instead of per-component tweens.
- `components/GamePhaseActionRow.tsx`: the chip container no longer animates `max-width`
  (`transition-[max-width,opacity]` → `transition-opacity`). Animating a layout property inside the
  board grid re-ran layout every frame for 300 ms on every chip-set change; the width still collapses,
  it just is not interpolated.
- `index.css` + `animation/flights.ts`: the `:has()` rules are gone. `markCardTraveling(element)`
  (ref-counted) now sets `body[data-card-flight-active]` (the `.card-drop-zone` un-clip) and
  `[data-board-half][data-flight-owner]` (rung 34). `:has()` re-invalidated the whole subtree on
  every attribute change during a flight; the body attribute is deliberately *not*
  `data-card-traveling` so the element-based selectors used by `e2e/helpers/multiplayer/flow.ts`
  keep counting cards only.
- `components/AttackLinkArrow.tsx`: the sampler `useLayoutEffect` has a dependency (`config`) and a
  `configRef` instead of running on every render, stops after its settle window, restarts on
  `resize`, and is `memo`-wrapped. It used to reset its 30-frame settle counter on every parent
  re-render, i.e. a rAF loop doing `querySelector` + 4 `getBoundingClientRect()` per frame while the
  board re-rendered.
- `GameView.tsx`: replaced `useGameUIStore()` (whole-store subscription → full board re-render on any
  targeting/selection/optimistic-rest write) with per-field selectors, and passes the three store
  hooks the side effects need (`IUseGameViewUIStoreSlice`). Wrapped the board in
  `<MotionConfig reducedMotion="user">` so reduced-motion users get no board transforms (the policy
  the flight engine already had).
- `GameHandRow.tsx` / `BattleFieldRow.tsx`: `layout="position"` and the rested tilt now use the
  shared springs instead of the default transition / a 300 ms rotate tween.
- Overlays got real enter/exit dynamics (`AnimatePresence`, opacity + short translate, exit ~140 ms):
  `GamePromptOverlay` (backdrop + panel), `PromptSelectionBanner` (now owns its own 3.2 s expiry and
  keyed enter, so `GameView` no longer keys/remounts it), `EffectNoticeBanner` (Motion fade replaces
  `.effect-notice-enter`, CSS block removed), `GameOverOverlay` (enter only, it unmounts on navigate).

## Constraints kept

- No persistent fractional `scale` on card faces; only transient overlay enters.
- No `AnimatePresence` around card rows (one visual per instance, `02-board-ui-hud.md`).
- Test anchors unchanged (`prompt-overlay`, `prompt-selection-banner`, `effect-notice-banner`,
  `game-over-overlay`, `data-card-traveling`); the structural rung-34 probe in
  `e2e/gameview.multiplayer.support.spec.ts` was updated to the new `data-flight-owner` mechanism.

## Verified

- `npm --prefix client run typecheck` — clean.
- `npm --prefix client run lint` — clean.
- Not run: Playwright. Re-run `gameview.multiplayer.support`, `gameview.multiplayer.board-animation`,
  `gameview.multiplayer.prompts`, `gameview.multiplayer.actions` and
  `gameview.multiplayer.phase-transition` before merging.
