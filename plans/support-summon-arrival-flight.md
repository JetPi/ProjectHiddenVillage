# Support row -> battlefield: the missing arrival flight

Symptom (screen recording, ~00:02): a support card (Suigetsu Hozuki, N-021, `[Support]` + `[Quick]`
"Summon this card") is activated out of the support area; when the activation resolves, the card is
**painted on the battlefield at its final box** with no trajectory. Meanwhile the phase banner moves on to
`Opponent Support Cut-In`, i.e. the state did advance - only the card's motion was missing.

The report proposed `layoutId` / `<AnimatePresence>` / `initial`-mount animation. None of those exist in this
engine on purpose (see [`plans/hand-to-zone-double-card.md`](plans/hand-to-zone-double-card.md:65) and
[`plans/hand-deal-flicker.md`](plans/hand-deal-flicker.md:10)): a play is an **entity flight** on the arriving
card's own element. The defect was that *no one owned this particular movement*.

## Why the card teleported

Every animated zone pair in the engine has an owner:

| movement | owner |
| --- | --- |
| hand -> support slot / hand -> field (client-initiated) | `runSubmitThenZoneEntryAnimation` from `submitSetSupport` / `submitMappedAction` / `submitSummonTargetSelection` |
| deck -> hand | `useHandZoneAnimationEffects` + `runDeckToHandAnimation` |
| hand/field -> trash (inferred ghosts) | `useHandZoneAnimationEffects` / `useCardMoveGhostAnimationEffect` |
| deck -> field (revealed summon) | `useDeckSummonFlightEffect` (reads `summon` events with `fromZone: deck`) |
| trash -> field (recall) | `useTrashRecallSummonFlightEffect` (trash-set diff) |
| **support zone -> field** | **nobody** |

The support case is the one movement that is neither a submit helper's job (the client does not move the card;
it only queues `activate-support:` and later watches a pass) nor covered by the two state-driven effects above:

- the server publishes the move - `SummonCardEffect` records `kind: summon, fromZone: <source zone>` (here
  `SupportZone`) - but `consumeRecordedDeckSummon` filters on `fromZone === 'deck'`, so the event is dropped;
- `useCardMoveGhostAnimationEffect` resolves destinations for `hand` and `trash` only, so a battlefield
  destination returns `null` and the loop skips.

Without an owner, the new battlefield element mounts and is simply painted. That is the "instant teleport".

## The two constraints that shape the fix

1. **The source rect must be captured before the push.** The same state push that mounts the battlefield card
   unmounts its support slot (support cards render no departure copy), so a `useEffect`/`useLayoutEffect` that
   reads the DOM *after* the push can no longer find where the card came from.
2. **The first painted frame must already be the offset one.** Hiding the element one frame late is enough to
   show the card at rest and then jump - the exact class of artefact the deal fix removed
   ([`plans/hand-deal-flicker.md`](plans/hand-deal-flicker.md:65)).

Both are satisfied by a **layout effect** that (a) snapshots every support slot's rect per instance on every
commit whose support/field lists change, and (b) on the commit where an instance is gone from the support row
but present as a `character-field-card`, calls `runElementFromRectAnimation` on that arriving element - which
hides it synchronously, before the browser paints the commit.

## What was built

- `useSupportSummonFlightEffect` (`views/game/hooks/GameView/effects/useGameViewEffects.ts`): layout effect,
  re-runs on `supportSummonSignature` (both players' support + battlefield instance ids, **labelled per zone**).
  A remembered slot is dropped as soon as it is used and expires after `SUPPORT_SUMMON_RECT_RETENTION_MS`
  (1.5 s) so a card that went to the trash can never fly onto the field later.
- `SUPPORT_SUMMON_FLIGHT_DURATION_MS` (360 ms) in `views/game/animation/tuning.ts`, matching the other
  summon-arrival flights.
- `IUseSupportSummonFlightEffectArgs` in `types/hub/hooks.ts`.

### The trap that cost a run: an ambiguous snapshot key

The first version keyed the effect on a bare `join('|')` of the four id lists. With one card on the top field
and one in the defender's support row the key was `X|Y`; after the summon (support empty, `X` still on the top
field, `Y` now on the bottom field) it was **`X|Y` again** - the key could not see the very move it existed to
notice, and the effect never re-ran. Measured with a temporary per-commit signature probe: the signature
repeated, unchanged, through the whole resolution. The key is now zone-labelled
(`top-support:…|top-field:…|bottom-support:…|bottom-field:…`), which is what makes a card crossing between two
adjacent rows visible at all. Any future "re-run when lists change" key needs the zone labels for the same
reason.

## Guard

`e2e/gameview.multiplayer.support.spec.ts` - "an interrupting N-008 cancels the attack and summons itself"
now installs the flight counter *after* the activation is queued (so the earlier hand -> support set-support
flight cannot satisfy it) and asserts the recorded flight for that instance belongs to
`character-field-card:bottom`, then that nothing is left travelling. `installCardFlightCounter` records the
flying element's `data-zone`/`data-slot-side` for exactly this, because a bare count or a bare instance id
cannot tell "the field card arrived" from "its old support slot moved".

## Verified

- `npm --prefix client run typecheck` - clean.
- `npm --prefix client run lint` - clean.
- Playwright: `gameview.multiplayer.support` (6/6), `board-animation` + `actions` + `quick-support` (15/15),
  `phase-transition` + `reveal-presentation` + `prompts` (8/8).

## Not in scope (still unowned, both pre-existing)

- field -> support (`SetSupport` from the battlefield) and support -> trash (`SupportUsed`): those leave the
  board for a pile/slot with no arrival element, and the support row renders no departure copy. Nothing in this
  change touches them; adding one means the same "capture the source before the push" treatment, mirrored.
