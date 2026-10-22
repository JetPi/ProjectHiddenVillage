# The board "shakes" when the game view mounts

Symptom (screen recording, ~00:00-00:02): on entering the game the board, the piles and the HUD jerk for a split
second before settling. Reported against a manual refresh, then confirmed to also happen when **navigating into the
game from the lobby** - i.e. it is the *mount* - and finally pinned to the case that always reproduces it: **after a
card has attacked**, i.e. when the board has a *rested* card, any reload/remount shakes again.

The report proposed three causes (a scrollbar toggling the width, board dimensions computed a frame late by JS, and
`motion` elements animating on mount). The measurement below rules the first two out and lands on the third, but not
where the report expected it: the element that animates on mount is the **rested tilt** on the battlefield card.

## What was measured

Probe: an `addInitScript` rAF loop (runs before any app script), one sample per painted frame, recording the board
rect, every card rect (`[data-card-instance-id]` / `[data-hand-instance-id]` / leader) and, in the second pass, the
card's *effective rotation* (walking up to the nearest element that owns one - Tailwind `rotate` first, then the
transform matrix).

| question | measurement |
| --- | --- |
| does the board box move after mount? | no - one rect (`117,54,1020,507`) from its first painted frame through 145 frames |
| does an idle-board card move after mount? | no - zero rect deltas (this is why an earlier pass of this investigation found nothing: the board had no rested card) |
| does a **rested** card move after mount? | **yes** - see below |
| does a scrollbar appear/disappear? | no - `window.innerWidth === documentElement.clientWidth` on every frame (`PageShell` is `h-dvh overflow-hidden`, so no document scrollbar exists at all) |
| JS-derived board dimensions? | no - the only runtime-written CSS vars (`--turn-split-start/end`) drive the turn-split gradient |
| a late webfont swap? | no - holding the `woff2` requests back 1.2 s changed nothing |
| does Motion *amplify* an unrelated late change? | no - a forced 20 px viewport change snapped in one frame, no spring |

## Cause 1 (the reported one): the rested tilt springs on mount

`BattleFieldRow` carries the rested pose on a Motion wrapper:

```tsx
<motion.div animate={{ rotate: isCardRested ? 14 : 0, transition: BOARD_ROTATE_SPRING }}
            transition={BOARD_LAYOUT_SPRING} layout="position">
```

without `initial={false}`, so on mount Motion springs `rotate` from 0deg to 14deg. Measured on a reload with one
rested attacker, per frame:

```
t=119  rot 0.0   rect 79x109      <- first painted frame: upright at the un-rotated box
t=251  rot 1.5   rect 82x111
t=332  rot 10.8  rect 98x122
t=515  rot 14.0  rect 103x125     <- settles
```

A rotating card's **bounding box grows ~24 px in both axes** while it turns, so *every* rested card on the board
expands and rotates at once for ~400 ms: a rapid vertical + horizontal "shake" of the whole battlefield. That is the
report exactly, and it explains the "only after an attack" condition - an idle board has no rested card.

**Fix:** `initial={false}` on that wrapper (a card mounts *in* its pose; a later `isRested` change still springs, which
is what the tilt is for). `FlippableCard` - the other animated card surface - has had `initial={false}` all along.
Re-measured after the fix: the first painted frame is already 14deg at `103x125`, and the pose never changes again
(20 changed frames -> 2, the second being "the card appeared").

**Guard:** `e2e/gameview.multiplayer.battle-visuals.spec.ts` - "a rested card is painted in its tilt and never
animates into it": summons the rush fixture, attacks with it (rested), installs the rest-pose sampler, reloads and
requires the *first* sampled pose to be within a degree of 14deg and exactly **one** distinct pose for the whole
observation window. Fails without the fix with `rotationDeg: 0, rect 79x109` ramping through `1.3, ...`.

## Cause 2 (found while measuring): the navigation scrim filtered the page

`RouteTransitionOverlay` keeps its scrim **mounted for the whole session** (its 200 ms fade-out needs it) at
`fixed inset-0`, and it carried `backdrop-blur-[2px]`. Measured on the settled board with nothing navigating:

```json
{ "backdropFilter": "blur(2px)", "opacity": "0", "busy": "false" }
```

An invisible-but-**active** full-viewport `backdrop-filter` makes everything under it a filtered backdrop, re-sampled
whenever the layer changes - and on a route change the scrim animates `0 -> 1 -> 0` while the board mounts underneath
it. `GameView`'s `Panel` already pins `backdropFilter: 'none'` for the same reason. The scrim now uses colours +
opacity only.

**Guard:** `e2e/gameview.spec.ts` - "the navigation scrim never filters the board underneath it": attached, idle
(`data-navigation-busy="false"`, `opacity: 0`) and neither `backdrop-filter` nor `-webkit-backdrop-filter` set.
Fails with `{"backdropFilter":"blur(2px)","opacity":"0"}` when the blur is put back.

## Verified

- `npm --prefix client run typecheck` / `lint` - clean.
- Playwright: `battle-visuals` (5, both new tests included) + `board-animation` (6) + `gameview.spec.ts` (6) - **16/16**.

## Rules for the future

1. **A card mounts in its pose.** Any Motion prop that describes *state* (the rested tilt, a flip, a selected tint)
   needs `initial={false}`; only a state *change* animates. `initial` defaults to `animate` for real, but a spring
   transition still interpolates from the DOM's static value - measured here, not assumed.
2. **A session-long overlay must not filter what it covers.** Anything `fixed inset-0` that stays mounted while
   invisible gets colours and opacity only.
