# Board animation: e2e anchor baseline (Stage 0)

Captured before the Motion migration so every stage knows which DOM contracts it may change and which it
must preserve. Re-check this list whenever a stage touches the board's rendered structure.

## Anchors that MUST survive the whole migration

These identify cards and zones for gameplay assertions (not just animation); losing them breaks
non-animation coverage.

- `[data-testid="game-board"]` — the board root.
- `[data-card-instance-id="…"]` — the canonical card identity hook.
- `[data-zone="character-field-card"][data-slot-side="bottom|top"][data-card-instance-id="…"]` — battlefield cards.
- `[data-zone="support"][data-slot-side="bottom|top"][data-card-instance-id="…"]` — support cards.
- `[data-testid="bottom-hand-card-{instanceId}"]` — a hand card.
- `[data-testid="bottom-hand-row"] [data-hand-instance-id]` — the bottom hand row and its order.
- `[data-testid="trash-pile-card"]` (+ `data-card-definition-id`) — the pile's displayed card.
- `[data-testid^="card-list-item-"]` — trash-overlay entries.
- `[data-side="bottom"]` / `[data-side="top"]` — the per-side rails.
- Targeting classes `battle-target-*`, `summon-target-*`, `attack-link-card-outline` — used by
  visual assertions.
- `[data-testid="card-flight-layer"]` — the single overlay surface every flight renders into (added Stage 2).
- `data-card-flight-copy` — an in-flight overlay copy (added Stage 2; the replacement for `data-card-ghost`).

## Anchors that WILL change (and the stage that changes them)

- `data-card-ghost` — **removed in Stage 2**; flights are overlay copies under the `CardFlightLayer`
  (`data-card-flight-copy`) and the e2e counter observes that instead.
- `#attack-link-overlay`, `#attack-link-overlay svg path[stroke]`, `[data-testid="attack-link-head"]` —
  reworked in **Stage 8** when `react-xarrows` is replaced by a Motion-native path.
- `data-card-moving` (CSS + inline flag) — removed in **Stage 2**; not referenced by e2e today, only by
  `index.css` and the animation helpers.

## The flight-copy counter (updated Stage 2)

`e2e/helpers/multiplayer/flow.ts` installs `installCardGhostAnimationCounter`, which monkey-patches
`Element.prototype.animate` and increments a counter whenever an element carrying
`data-card-flight-copy="true"` starts an animation. `getCardGhostAnimationCount` then asserts a card was
actually animated rather than teleported (used by the support K.O., bounce and leave-play specs).

Stage 2 repointed the attribute from `data-card-ghost` to `data-card-flight-copy`, so the counter now sees
*every* flight (draws included), not just zone exits; the specs assert `> 0`, so they stay valid. The
function names still say "ghost" - Stage 9 renames them, and the director's descriptor log becomes the
durable signal.

## Specs that assert animation DOM today

| Spec | What it pins |
|---|---|
| `e2e/gameview.multiplayer.battle-visuals.spec.ts` | `#attack-link-overlay`, its `path[stroke]`, `[data-testid="attack-link-head"]` geometry vs the target |
| `e2e/gameview.multiplayer.leader-battle.spec.ts` | `#attack-link-overlay` presence |
| `e2e/gameview.multiplayer.actions.spec.ts` | trash-slot bounding box stability across a tribute summon (the overflow-un-clip blowout regression) |
| `e2e/gameview.spec.ts` | hand-row instance order and hand-card bounding boxes (drag/reorder) |
| `e2e/gameview.multiplayer.prompts.spec.ts` | mulligan hand-row visibility |
| `e2e/gameview.multiplayer.reveal-presentation.spec.ts` | board mutations via `MutationObserver` |
| `e2e/gameview.multiplayer.support-target-visuals.spec.ts` | targeting highlight visuals |

## Also true today

- The hand rows are Motion-owned from Stage 3 (`AnimatePresence` + per-card `motion.div`); `@formkit/auto-animate`
  is gone. The hand-row anchors above (`bottom-hand-row`, `data-hand-instance-id`, `bottom-hand-card-{id}`)
  are unchanged, and per-card `layout` is switched off while a drag is in progress.
- The rested tilt is a CSS `transition-transform` (`BattleFieldRow.tsx`), which is why `AttackLinkArrow`
  re-samples layout for 30 frames and why the e2e arrow geometry has tolerances.
