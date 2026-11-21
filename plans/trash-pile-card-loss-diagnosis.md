# A card vanishes from a player's trash

Report (from before the support-row slot fix): one player's trash occasionally *disappears* — the pile can
no longer be read or opened — and it is gone for **both** players, so it is not one client's rendering glitch.
The reporter's hypothesis was that the support row's out-of-range slot index was involved.

This document reconstructs what can produce that symptom, ranks the candidates, and records what closed each
of them.

## TL;DR

There are two independent ways to make a trash card disappear, and the report matches both:

| | mechanism | scope | recoverable? |
| --- | --- | --- | --- |
| **C1** | `MoveCardToZone` removed the card from its source **before** validating the destination index, then threw. The action failed, but the hub still pushed the mutated state, so both clients dropped the card. | closed on 2026-11-21 for every destination zone | was **no** — the card was in no zone |
| **C2** | A card flight left `overflow: visible` on the pile's clipping ancestors; the pile grid inflated to its min-content box and the **second** pile slot (Trash on the opponent's side) was pushed out of the rail and clipped. | pre-2026-10-13 animation code | yes — a reload re-measures |

The out-of-range error the reporter remembers is real: the game engine has exactly one
`ArgumentOutOfRangeException` and it is thrown by C1's move path.

## C1 — a refused move consumes the card (fixed)

[`MoveCardToZone()`](server/Api/Services/Games/GameRuntimeDeckService.cs:158) used to take the card out of its
source zone first and validate the destination afterwards:

```csharp
var movedCard = sourceList[sourceIndex];
sourceList.RemoveAt(sourceIndex);          // card already out of its zone
...
if (insertIndex < topDeck || insertIndex > destinationList.Count)
{
    throw new ArgumentOutOfRangeException(... "Destination index must be between {0} and {count}" ...);
}

destinationList.Insert(insertIndex, movedCard);
```

The check now runs before the removal ([line 212](server/Api/Services/Games/GameRuntimeDeckService.cs:212)) and
the insert is the first statement after it ([line 251](server/Api/Services/Games/GameRuntimeDeckService.cs:251)),
so no later failure can leave the card in no zone:

```csharp
if (destinationZone != PlayerZone.SupportZone && destinationIndex.HasValue
    && (destinationIndex.Value < topDeck || destinationIndex.Value > destinationList.Count))
{
    throw new ArgumentOutOfRangeException(...);
}

var movedCard = sourceList[sourceIndex];
sourceList.RemoveAt(sourceIndex);
destinationList.Insert(insertIndex, movedCard);   // validated: this cannot fail
// field exit/entry rules, reveal reset, controller assignment and the movement record only mutate the card
```

The throw happens between the removal and the insert, so the instance is left in **no zone at all**. Nothing
rolls the removal back, and nothing holds a copy:

- [`MoveCardEffect`](server/Api/Services/Games/Effects/CardEffects/Control/MoveCardEffect.cs:246) turns the
  exception into a validation error (`Game.Effect.MoveCard.Move.InvalidDestinationIndex`) and returns it to the
  acting player. The card is already gone.
- The hub still broadcasts. [`ExecuteAuthorizedGameMutation`](server/Api/Hubs/GamesHub.Auth.cs:12) documents
  this deliberately: *"A failed operation can still have partially mutated the game … without the notification
  both clients would keep a stale snapshot"*. It calls `NotifyGameStateInvalidatedAsync` on the error branch
  ([line 82](server/Api/Hubs/GamesHub.Auth.cs:82)), so **both** clients refetch and the card is missing for both
  of them, in the same push, while the actor sees only an error toast.

That is exactly the reported signature: it disappears for both players at once, and a refresh does not bring it
back (the instance no longer exists in any zone). It is also invisible in the action log — the action failed, so
no movement entry was recorded.

### Why the support-row fix is the same bug, and why it is only half closed

The 2026-11-19 change
([`3acb333`](server/Api/Services/Games/SupportSlotRules.cs:5)) noticed this exact ordering problem — *"the move
removed the card from its source zone before resolving the destination slot, so a refused move (full row,
occupied requested slot, out-of-range index) silently swallowed the card"* — and moved the **support slot**
resolution above the removal. The generic `insertIndex` check at
[line 273](server/Api/Services/Games/GameRuntimeDeckService.cs:273) was left where it was, so the swallow is
still possible for every other destination (`Hand`, `Deck`, `Trash`, `ExileZone`, `CharacterField`) whenever a
caller passes an explicit index.

Before that fix the support row had the neighbouring defect: a move into the row with no index used
`destinationList.Count` as the slot ([old line](plans/support-slot-flash.md:18)). That produced a second card on
an occupied slot, or index 5 — a card no client draws. The out-of-range error the reporter remembers is probably
one of:

- `A valid support slot index is required.` — Set Support rejecting an index outside `0..4`
  ([`SupportSlotRules.TryResolveSlot`](server/Api/Services/Games/SupportSlotRules.cs:53)); or
- `Destination index must be between 0 and N.` — the C1 throw, which leaves the card nowhere.

The first is harmless (the card stays in hand); the second is the one that loses a card. Either can be raised by
a move out of the **trash** (a trash recall or any `MoveCard` with `sourceZone: Trash`), which is why the lost
card reads as "one of my trash cards".

### What shipped

- The bounds check moved above `sourceList.RemoveAt`. A same-zone move is validated against the destination's
  size *before* the card is taken out, which is the same accepted range the old post-removal check accepted (the
  decrement maps `index == Count` onto the post-removal list end), so `destinationIndex == Count` stays legal.
- The destination insert is now the first statement after the removal, with the field exit/entry rules, the
  reveal reset, the controller assignment and `RecordZoneMove` following it — none of them can un-place the card.
- The same remove-last ordering applies to the three hand-rolled move sites:
  [`DestroyCardEffect`](server/Api/Services/Games/Effects/CardEffects/Control/DestroyCardEffect.cs:70),
  [`SummonCardEffect`](server/Api/Services/Games/Effects/CardEffects/Summoning/SummonCardEffect.cs:120) and
  [`TributeSummonCardEffect`](server/Api/Services/Games/Effects/CardEffects/Summoning/TributeSummonCardEffect.cs:132).
- Guarded by
  [`MoveCardRefusalTests`](server/tests/ProjectHiddenVillage.Server.Tests/MoveCardRefusalTests.cs:1): one refusal
  per destination zone (`Hand`, `Deck`, `Trash`, `ExileZone`, `CharacterField`) asserting the card still exists
  exactly once, the trash-recall refusal that encodes the report, and the `< Count` / `== Count` / `> Count`
  boundary for both a cross-zone and a same-zone move. `dotnet test`: 1122 passed.

## C2 — the pile grid inflated and the opponent's trash slot was clipped away

This is the "disappears and becomes unaccessible" reading: the pile is still in the state, but it is laid out
outside its rail and hidden, so neither player can hover it or open the trash viewer.

The pile rail places two slots in a two-column grid whose columns are `auto`
([`PlayPileZone.tsx:65`](client/src/components/ui/game/PlayPileZone.tsx:65)) inside a fixed-max-width box with
`overflow-hidden`; the top side is `Deck | Trash` and the bottom side is `Trash | Deck`
([`GameZones.tsx:287`](client/src/views/game/components/GameZones.tsx:287)). When the grid's contents outgrow
the box, the **second** label is the one that gets clipped — which is the top player's `Trash`, i.e. "one of the
players' trash" and the one both players can see. The guard that could allow that is documented in
[`.clinerules/02-board-ui-hud.md:387`](.clinerules/02-board-ui-hud.md:387):

> if its clip is ever lost the freshly rendered deck/trash art blows the whole pile grid out to its min-content
> box — both slots grew from ~78×108 to ~100×274 on a 1080p board.

Before the 2026-10-13 animation refactor (`a28fd56`, which replaced the overlay-copy flights), flights stripped
`overflow` from every clipping ancestor of the animated element (`resolveOverflowAncestors`), and restored it
when the animation settled. A
destination-side flight measured the **trash slot's** element, so the pile's own clip was among the stripped
ancestors. If the animated element unmounted mid-flight the restore never ran and the pile stayed un-clipped —
the documented "giant card / blown pile" state. A support card is a good candidate for that unmount, because the
pre-fix row was collapsed into a `Map` keyed by slot index
([`plans/support-slot-flash.md:51`](plans/support-slot-flash.md:51)): a duplicated slot or an index `>= 5` made
the survivor flip between pushes, which remounts the cell, and the row rebuild happens on the same push that
grows the trash (a support card leaving for the trash). That is the only plausible way the support-row defect
touched the **trash** at all — it did not change any zone data.

Today this path is gone (flights move the card's own element and never un-clip anything) and
`PlayPileZone` carries the `min-w-0 min-h-0` guard, so C2 should no longer be reachable.

## Ruled out

- **The state mapper drops cards.** Both `SupportZone` and `Trash` map every instance
  ([`GameStateResponseMapper.Zones.cs:44`](server/Api/Services/Games/GameStateResponseMapper.Zones.cs:44)); the
  support row is normalized on the way out, never filtered.
- **The trash viewer loses a definition.** `buildCardListEntries` accepts a missing catalogue card and the
  overlay renders a disabled tile with a fallback label
  ([`CardListOverlay.tsx:15`](client/src/components/ui/cards/CardListOverlay.tsx:15)), so an unknown definition
  cannot make the pile unreachable. (It *can* hide a card on the field/support/hand, because
  [`resolveNonLeaderCards`](client/src/views/game/utils/functions/cards/index.ts:114) skips instances whose
  definition is not in `cardById` — a separate, still-open cosmetic risk, but not a trash symptom.)
- **A rewind/snapshot lost the pile.** [`GameStateSnapshot.ClonePlayer`](server/Engine/Services/GameStateSnapshot.cs:168)
  copies every zone, and the contract test fails when a new member is neither copied nor shared.
- **The other client simply did not get the push.** Every mutation path notifies the whole game group, including
  the failure branch ([`GamesHub.Auth.cs:82`](server/Api/Hubs/GamesHub.Auth.cs:82)).

## Guards still worth adding

1. **Card conservation, checked at the mutation.** After every mutation, a Development/test-only audit should
   assert that the union of `Deck + Hand + Battlefield + SupportZone + DiscardPile + ExileZone` holds each
   instance exactly once. The ordering fix makes a *refused* move safe; an audit would still catch any future
   path that drops a card for a different reason, at the action that caused it instead of days later.
2. **Pin the pile's geometry.** An e2e that uses a middle support slot, lets the card leave for the trash, and
   then asserts `[data-testid="trash-pile-card"]` is visible *and* inside the board's box would have caught C2,
   which no current spec measures (the support spec samples instances and slot indexes, not the pile's rect).
