# A refreshed board must be painted, not animated

Symptom (reported from a page refresh): "a bunch of cards move into position". On reload the board should *be*
in its layout on the first frame; instead several cards travelled across it before settling.

## What was replayed

The state payload carries a bounded tail of recorded card movements (`GameStateResponse.AnimationEvents`,
built from `state.RecordedCardMovements`), and every flight effect animates the events it has **not handled
yet** (`IGameViewAnimController.handledAnimationEventIds`). That is right for a push that arrives while the board
is mounted, and wrong for the payload the board mounts with: a reload hands the client the last movements of the
game, which already happened.

Two consumers were re-running that history:

- `consumeRecordedDeckSummon` (`useDeckSummonFlightEffect`) filters on `fromZone: deck` and had **no mount
  guard at all**, so an old deck -> field summon flew again out of the deck slot. It also consumes exactly
  **one event per pass** (`if (deckSummon || ...) continue` then `return deckSummon`), so a tail with several
  old summons walked a *sequence* of flights, one per commit - which is why it read as "a bunch of cards
  moving".
- `useHandZoneAnimationEffects` skipped its first pass (`previousHandZoneSnapshot.isInitialized === false`) but
  did **not** mark those events handled, so the *second* pass treated every old `draw`/`discard` in the tail as
  new: cards flew out of the deck into a hand that already held them.

Measured with the regression spec below, with the fix disabled: **3** flights on one reload of a board whose
only real movement was a single summon.

## Fix

`useAdoptRecordedAnimationEventsOnMount` (`views/game/hooks/GameView/effects/useGameViewEffects.ts`): a layout
effect, called as the **first** effect of `useGameViewSideEffects`, that marks every `animationEventId` in the
mount payload as handled before any flight effect of that commit runs.

- "Unhandled" now means "happened while I was watching". Nothing is lost: a movement that happens after mount
  arrives in a later payload with an id that is not in that set.
- It is the same rule `EffectNoticeBanner` already follows for `effectNotices` ("the newest notice that was not
  already in the payload when the board mounted", see `02-board-ui-hud.md`), and it is what makes a refresh's
  first render its final one.
- `useTrashRecallSummonFlightEffect` and `useSupportSummonFlightEffect` were already mount-inert (their
  previous-state ref is empty on the first pass); `useCardMoveGhostAnimationEffect` likewise (no previous
  snapshots). The two consumers above were the gap.

## Guard

`e2e/gameview.multiplayer.board-animation.spec.ts` - "a reloaded board is painted where it belongs and animates
nothing":

1. leaves real history in the payload (a summon from hand, and the draws that led to it),
2. installs an `addInitScript` counter **before** the reload (a post-load `page.evaluate` would miss the first
   frames), which records the instance id of every `element.animate` call made on an element the flight
   primitive tagged `data-card-traveling`,
3. reloads, asserts the summoned card is visible in its battlefield slot, waits 1.5 s (longer than any flight
   plus a per-pass replay chain) and requires **zero** recorded flights, nothing travelling and nothing held
   waiting for a flight.

Fails with the three replayed flights when the adoption is removed; passes with it.

The same file's first test ("a moving card travels as itself...") used to wait for flights during the *opening*
with a warm-started game - i.e. it was really observing the replay. It now drives a summon after mount and
asserts *that* card's flight, which is what it always meant to pin.

## The attack shake, which the flight adoption did not cover

Second report, after the block above shipped: "the shake of a completed attack seems to overrule this fix."
`useAttackLungeEffect` is the other consumer that animates something a mount did not witness, and it gets there
two different ways:

1. **The `Damage` presentation was already pending at mount.** The ack of the page the player refreshed away died
   with it (or the presentation is waiting on the other player), so the new page mounts with a presentation whose
   shake it already played. `handledPresentationIdRef` is now **seeded from the mount payload's id**, exactly like
   the movement tail: the presentation still resolves, it just does not animate second time.
2. **The attack was declared before the mount.** This is the case that actually reproduces, and the reason the
   first hypothesis alone was not enough: reload inside the cut-in window and the fresh payload still carries
   `pendingAttackVisualState`, so `attackPairRef` is populated on mount - and the damage step then lands *after*
   the mount, on a page that never showed the swing, and shook the attacker for it.
   `mountedDuringPendingAttackRef` therefore records "this page was born inside an attack" and blocks the lunge
   for that attack's damage step. A page that mounts and then watches a whole attack (declaration -> damage) still
   shakes: that is the case the motion is for.

Note that the *opposite* combination cannot reproduce it: if the damage presentation is pending but the attack is
no longer pending, `pendingAttackVisualState` is already `null` at mount, `attackPairRef` stays empty and no lunge
is possible at all (measured on the leader-attack flow: `attackSequenceStage: null`, `isAttackSequencePending:
false`, `presentation: 'Damage'`).

Guard: `e2e/gameview.multiplayer.battle-visuals.spec.ts` - "a reload inside an attack window does not shake the
attacker when the damage step lands": declares a real attack with the rush fixture, reloads while the sequence is
parked at `SupportCutIn`, then closes the windows the way the boards do (whoever is offered `pass-turn`) so the
damage step runs *after* the reload, and requires zero shakes and zero flights from an `addInitScript`
`Element.prototype.animate` recorder installed before the reload. The shake has more than two keyframes, which is
what the recorder counts. Fails with `{"shakes":1}` when the mount guard is removed.

## Verified

- `npm --prefix client run typecheck` / `lint` - clean.
- Playwright: the whole `e2e/gameview.multiplayer.*` suite (44 tests) green, including `board-animation` (6,
  the reload test included), `battle-visuals` (3, the shake test included) and `prompts` (mulligan draws must
  still animate - they happen after mount, so they are not adopted).
