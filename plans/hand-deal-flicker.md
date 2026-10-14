# Hand deal: the flicker (diagnosis + fix plan)

Symptom (from a screen recording): while the hand is dealt, cards are seen at their resting spot and then dealt
again ("flicker" / "the cards appear, then move"), and the mulligan batch swap looks worse still.

A report written off that recording proposed three causes and three fixes. This file records what a per-frame
probe of our own engine actually measured, which of the report's causes are real here, and what the fix is in
*this* architecture (entity flights, not `layoutId` projection).

## What the report proposed, and what holds here

| Report's proposal | Verdict in our engine |
| --- | --- |
| Cards mount at their default layout position for a painted frame before Motion measures layout | **Partly real, but not the cause.** Our cards mount at their *final* slot (the layout is owned by `Reorder.Group`, no measuring pass), and the painted frame at the resting spot comes from a different mechanism (below). |
| Wrap the hand in `AnimatePresence mode="wait"` with a batch key | **Rejected.** A batch key remounts the `Reorder.Group`, which would drop the drag state and the per-card geometry every flight measures against. The sequencing it is meant to provide already exists on the client-driven paths (submit after the flight settles). |
| `initial`/`animate`/`exit` transforms on the card, `layoutId` projection, stagger via `transition.delay` | **Rejected as stated.** That puts a second transform owner on the same card as the entity flight (Motion on the slot, WAAPI on the card), which is the class of bug this migration removed; and `layoutId` cannot cover a deal at all (the deck's top card has no instance identity - see `board-position-fixes.md`). |
| Keys must be unique instance ids, not indices | **Already true** (`getCardKey={(card) => card.instanceId}`). |
| `position: relative` + `overflow: visible` on the hand container, `will-change` | **Already true** (both the card container and the row declare `overflow-visible`; the hand row does not clip a flying card). Clipping was not the cause. |
| "Hide cards until animation coordinates are set" (start invisible) | **This is the right idea**, and it is what the fix implements - but the *hidden* state has to hold until the card's own flight starts, and the flight has to be the only thing that reveals it. |

## What the probe measured (opening deal, both pages)

Sampler: `addInitScript` (before any app script, so the opening deal is included), one sample per painted frame
per hand card, change-only, recording computed opacity, the card's own transform, `data-card-traveling`, whether a
Motion opacity animation is running on the slot, and the flip angle. 376 frames, 10 cards per page (5 per row -
each page mirrors the other player's draws, so **both** hands animate).

Per card, from the opening deal on player one's page (times in ms on the page clock):

```
B:00cc7e  mount=1575  firstVisibleAtRest=1582  restOpaqueBeforeFlight=YES  flight=1805..2238  opAtFlightStart=1     motionFadeDuringFlight=YES
B:399675  mount=1575  firstVisibleAtRest=2038  restOpaqueBeforeFlight=no   flight=1604..2038  opAtFlightStart=0.64  motionFadeDuringFlight=YES
B:61dc82  mount=1575  firstVisibleAtRest=1582  restOpaqueBeforeFlight=no   flight=1671..2104  opAtFlightStart=0.95  motionFadeDuringFlight=YES
B:9919bd  mount=1575  firstVisibleAtRest=1582  restOpaqueBeforeFlight=no   flight=1738..2171  opAtFlightStart=0.99  motionFadeDuringFlight=YES
B:fca8ae  mount=1575  firstVisibleAtRest=1582  restOpaqueBeforeFlight=YES  flight=1888..2304  opAtFlightStart=1     motionFadeDuringFlight=no
```

Totals, identical on both pages: `cards=10 flew=10 paintedFullyAtRestBeforeOwnFlight=4 motionFadeDuringFlight=8`.

Readings:

1. **The arrival is animated twice.** Every dealt card runs Motion's mount fade
   (`initial={{ opacity: 0, scale: 0.94 }}` → `animate={{ opacity: 1, scale: 1 }}`, duration
   `DECK_TO_HAND_FLY_DURATION_MS`) **on the slot**, at its resting position, *and* an entity flight on the card
   inside the slot (`transform:420`). `motionFadeDuringFlight=8/10` and `opAtFlightStart` of 0.64 / 0.95 / 0.99
   show a card starting to fly while it is still partly transparent - it materialises in mid-air.
2. **The card is fully painted at rest before its flight.** `B:00cc7e` was visible at rest from 1582 but its
   flight did not start until 1805: **223 ms of a fully opaque card sitting in the hand**, then a jump to the
   deck and a flight back. That is the flicker the recording shows. It is worst for the last card of a batch.
3. **The stagger is the amplifier, not the cause.** Flights start 67 ms apart (1604, 1671, 1738, 1805, 1888),
   while the Motion fade starts immediately for all of them; the later a card's flight, the longer it sits fully
   visible at rest (up to 223 ms here, more with a bigger batch).
4. **The flight's "hide one frame" step cannot help.** It hides the element only at the moment the flight starts
   (`vis=hidden` one frame before the offset), which is *after* the card has already been painted at rest. The
   hidden window has to begin at the card's first paint.
5. **No flip was observed in the opening deal** (`flipped=0`; the 3D wrapper's `matrix3d` was never read, in
   either row). So either the dealt hand arrives face-up, or the flip happens outside the sampled window. The
   fix adds a `data-card-face` attribute to `FlippableCard` so the flip becomes observable and assertable, and
   the probe is re-run afterwards to settle it (the user asked for the face-down→face-up flip to be covered).
6. The mulligan window produced no samples in this pass (a probe bug: clearing the trace replaced the object the
   sampler held). The mechanism is understood from the code - `pendingMulliganDrawReplay` flies the new batch
   from the deck while the same batch also runs the Motion mount fade - and the probe now marks instead of
   clearing, so the post-fix run will cover it.

## The fix (one rule: the flight that carries a card is the only thing that reveals it)

1. **A card that is about to be flown is not painted until its own flight starts.** The arriving set is derived
   *during render* from the draw events the client has not handled yet (`animationEvents` ∩ hand instance ids),
   so the very first paint of the batch is already hidden - a passive effect (which runs after paint) can never
   achieve that, which is why the current hide-one-frame step is too late. The row renders those cards with a
   `data-card-arrival-pending` marker.
2. **The flight releases its card.** `runElementFromRectAnimation` (and the arrival helper) clears the marker and
   treats the card as visible when it starts, and applies the source offset in the same task, so the first frame
   that is ever painted for that card is the offset one.
3. **No second animation on a card that is flown.** The Motion mount fade is not applied to a pending arrival
   (it stays for a card that mounts with no flight to carry it - today only the opponent's row can be in that
   state, and the row states which is which explicitly rather than relying on both happening to line up).
4. **The mulligan batch is released by its own deal sequence**, not by the state push: the same pending marker
   covers the replay batch, so the new hand cannot appear before the flights that deal it.
5. **A failed or skipped flight must still release its card** (reduced motion, missing element, cancelled): the
   marker is cleared on settle *and* on cancel, and the row drops the marker for a card that leaves the hand, so
   a card can never be stranded invisible. This is the invariant the guards assert.

## Guards to land with the fix

- A dealt card is never painted (visible, at rest, opaque) before its own flight starts - asserted from a
  page-side sampler, on both rows.
- A card that is flying never has a Motion opacity/scale animation running on its slot.
- After the board settles: no `data-card-traveling` and no `data-card-arrival-pending` left anywhere (the
  existing "nothing left mid-flight" assertion, extended to the new marker).
- Reduced motion still settles: no marker left, acknowledgement resolves (the existing reduced-motion spec).

## What was changed (as built)

- `useHandZoneAnimationEffects` is now a **layout effect**, and it marks every arriving card
  (`markCardAwaitingArrival`) before anything is scheduled. A layout effect is the only hook that runs after the
  pushed hand is mounted but *before* the browser paints it, so the hold is on for the card's very first frame;
  the passive effect that schedules the flights runs after that paint and could not have done it. `index.css`
  makes a held card unpaintable (`[data-card-arrival-pending='true'] { visibility: hidden }`).
- Each flight **releases its own card** in the same task that starts it (`releaseCardAwaitingArrival` immediately
  before the flight call), so no frame can be painted between the hold coming off and the flight offsetting the
  card. The teardown releases every hold (`releaseAllCardArrivals`), so a cancelled batch cannot strand an
  invisible card.
- `HandCardItem` and the plain row branch lost their `initial`/`animate`/`exit` entirely: the flight (and the
  drag, and the reorder projection) stay Motion's; a mount animation is not. This is what removed the "flying at
  64% opacity" half of the artefact - the fade was on the *slot*, so no rule on the card could have beaten it.
- `runElementArrivalFromRectAnimation` now waits for the destination to have a **box**, not merely to exist: a
  slot that has mounted but has no box is what made arrivals silently skip (the card then landed unanimated).
- `FlippableCard` publishes `data-card-face`, so the flip is observable and assertable (both faces are always in
  the DOM, so nothing else in the markup distinguished them).

## After the fix (same probe, same windows)

| window | painted fully at rest before own flight | Motion fade during a flight | `opAtFlightStart` |
| --- | --- | --- | --- |
| opening, both pages | 0 of 10 (was 4) | 0 of 10 (was 8) | 1.00 for every flying card (was 0.64 / 0.95 / 0.99 / 1.00) |
| mulligan owner | 0 of 16 | 0 | 1.00 |
| mulligan other page | 0 of 11 | 0 | 1.00 |

Every card is held from its first frame (`heldUntil` < `flight` start, and its first visible-at-rest sample is
now its flight *end*). The flip is confirmed as part of the deal: cards arrive face down and turn front **inside
their flight window** (e.g. `face=back->front@1738` with `flight=1659..2068`), and the opponent's row stays face
down throughout, which is correct.

## Guards now in the suite

- `gameview.multiplayer.board-animation.spec.ts` - "a dealt hand is revealed by its own flight, never by a second
  animation": a hold must have happened, no held card may be painted, no flying card may carry a Motion
  animation, and no hold may survive the settle. The first assertion is what makes the other two non-vacuous
  (before this work there were no holds at all, so the naive version of this test would have passed while the
  flicker was still happening).
- The same spec's reduced-motion test now also asserts no hold is left behind (a skipped flight must release).
- `gameview.multiplayer.prompts.spec.ts` - the mulligan test asserts the batch swap on top of its flight
  assertions: cards held, none painted while held, none animated twice, no hold left.

## The mulligan, second pass (measured after the fix, still wrong to the eye)

The user confirmed the initial deal is clean and the mulligan is not. A second probe recorded the owner's hand row
per content change *and* took clipped screenshots of the row every 120 ms around the click. What it found:

1. **The row is partly blank while the batch arrives.** The hold is released per card, in stagger order, so for
   ~300 ms the hand shows one card and hides four (trace: `visible=1 rendered=5 held=4` at the click, then
   `held=3`, `held=2`, `held=1`, `held=0` as each card's flight starts), and by the end all five are in the air at
   once. The incoming batch is *correct* per card, but as a sequence the hand reads as incomplete and then
   re-filled.
2. **Frames of empty placeholder boxes.** The clipped screenshots show the hand row holding five empty slot boxes
   labelled "Card Image / Unavailable" at t≈471 ms, the row *empty* at t≈1019 ms, and cards arriving as backs
   (plus one front-side placeholder) at t≈1662 ms. So the row does show content that is not a card face.
3. **The outgoing batch and the incoming batch are not sequenced against each other.** The trace at the click
   already contains cards *arriving* (holds being released in stagger order, `face=back->front` on the first) while
   the previous deal's flight for `5affa8` is still `traveling` - i.e. the mulligan's fan-out and the redraw's
   arrivals can overlap with the tail of the previous batch. `handlePromptResolve` guards this with
   `drawAnimationEndsAt`, but that deadline is computed from the draw constants, so flights that run past it (or a
   batch that is still in the air when the prompt is answered) are not covered.

Neither of those two diagnoses was the heart of it. The user's own reading was the right one: *"sometimes
something delays, and the old cards appear in the hand for a moment before the new ones reappear."* That is not a
choreography problem at all - it is the **exit flight putting the card back**:

> `runElementToRectAnimation` borrows the card's transform for the flight and restored it when the animation
> settled. The card element is still mounted at that moment (the state that removes it has not arrived yet - one
> hub round-trip is enough), so the restored transform painted the departed card back into the row it had just
> left, and only then did the replacement hand arrive.

So the fix is in the primitive, not in the schedule: **an exit flight ends with its card hidden.** It still
restores the transform (so the element's own state stays clean for whoever renders it next) but leaves visibility
hidden, because a card that has travelled away has left - the state that removes it takes the element away for
good. This covers every departure in the engine, not just the hand: the mulligan's return, a prompt discard or
placement, a tribute material, and the field row's retiring card.

The batching I tried first was reverted: the user liked the cards going back one at a time, and the stagger was
never the defect (`HAND_TO_PILE_STAGGER_MS` and the per-card draw stagger are back, unchanged).

The guard is in `gameview.multiplayer.prompts.spec.ts`, and it is the reported symptom stated as an invariant:
**a card that has flown out of a hand row is never painted in that row again** while the state catches up
(`returnedAfterExit` in `installHandArrivalFlickerObserver`). It is failing-first, proven by disabling the hide:
the assertion then fails with exactly the outgoing hand - `returnedAfterExit: 5` - and passes with the fix.

Getting that observer honest took two corrections worth recording, because both are traps for the next person:
classifying a flight by "is the card held right now" **cannot work** (the hold is released in the same task that
starts an arrival's flight, so the earliest card of every batch looks like a departure - 13 false positives), and
classifying it by the hold *since the element's last flight* mostly works but still misses those same sub-frame
holds (4 false positives). What works is reading the flight's **direction**: on its last airborne frame an
arriving card is inside its own row and a departing card is at a pile outside it - a signal that is independent of
the fix it guards.

## Findings that are *not* fixed here (recorded, not guessed)

1. **An activated-from-hand support is queued, not placed.** A 12 s DOM probe found the activating card is never
   rendered in the support zone, so `submitSetSupport`'s arrival flight has no destination: it resolves to the
   fallback (any support card in the row) or is skipped. The copy engine had the same hole (a copy aimed at the
   same missing element), so this is not a regression from the entity work - but it is why a "support activated
   from hand" can land with no flight at all. It needs a design decision: either the queued card is rendered
   where it can fly to, or the activation is animated as a hand → support-area *exit* flight instead of an
   arrival. The support spec carries a note where the assertion would otherwise be.
2. **Event-less pushes are not held.** The hold is derived from the recorded draw events (which the engine
   publishes for the deal, the mulligan redraw and turn draws). A push that carries no movement events still
   falls back to the count/zone inference to *fly* its cards, and those cards are not held - so they can still
   flash once. Closing it needs the inference to publish its arrivals before paint too (the reason this was left
   alone: the inference needs the previous snapshot, which is a ref, and the repo forbids reading refs in render).
3. **The non-owner page's view of the opponent's redraw** animates only when the events match its own hand sets
   (in the mulligan window it flew 1 card there instead of 5). Those cards are the opponent's, face down, so the
   gap is cosmetic; the owner's page - where the player's own hand is - is complete.
4. The `attack-sequence` turn-handover test remains the known load flake: it failed in the loaded full run
   (44/45) and passed in isolation (22.3 s).
