# Deck summary row + join-by-code format check

## Problem

The line under the deck control is a one-off: it only appears for imported decks, only says whether the deck is legal
in *some* format, and names nothing. A player picking a saved deck gets no feedback at all, and a player typing a code
learns about the table's format only after the server refuses their deck.

Two changes, one area:

1. That line becomes a deck summary: whether the selected deck is legal in the format that applies right now, and the
   deck's name.
2. Typing a code resolves the format the table is actually played in, and every deck is judged against it for as long
   as the code sits in the field.

## 1. The deck summary row

One row under the deck control, in the slot the current `login-deck-format-status` paragraph occupies:

```
[ NOT LEGAL ]  L-001 Naruto Uzumaki
```

- **First:** a pill for the format that applies to the current tab - `LEGAL` on green, `NOT LEGAL` on orange, using the
  same pill vocabulary as the import dialog's format rows.
- **Then:** the deck's name immediately beside it, normal font (`text-xs font-normal`, secondary colour). Both sit at
  the start of the row rather than being pushed apart.

The format that applies:

| Tab | Format judged against |
| --- | --- |
| Quick Match | the quick-match format currently selected |
| Join or Host | the format of the game behind the typed code, once it resolves; otherwise the host format |

Deck name, per deck mode:

- **Saved** and **Starter**: the deck's `name` and nothing else. Blank names fall back to `Deck {{shortId}}`.
  The select options are trimmed the same way, so counts no longer appear anywhere a deck is named.
- **Import**: no name exists, so the deck is named after its leader, `{{cardId}} {{displayName}}` resolved from the
  imported list's card metadata. A deck with no leader (or metadata still loading) reads `Imported deck`.

Details:

- The starter deck objects are currently thrown away after being turned into select choices and card maps. The view
  needs `starterDecks` state alongside them so a name can be looked up.
- While metadata or the target format is still loading, the row shows the deck name and a `Checking...` legality
  label rather than an error.
- The parse-error line (`login-deck-invalid-value`) stays where it is; it is an error, not a status.
- The import dialog always lists **every** active format: it is where a deck gets fixed, so narrowing it to the format
  the current tab plays would hide the other formats the deck could still be made legal in. The single-format warning
  is the login view's job.

## 2. Join by code: resolve the table's format

### Server

`GET /api/games/{gameId}/ruleset`, anonymous like the existing `GET /api/games/{gameId}/cards`, because the code is
the secret and a joiner is not a player yet.

- `200` with `GameRulesetBindingResponse { id, key, name }` for a bound game.
- `200` with `null` for an unbound game (no format to check; the server admits any deck there).
- `404 Game.NotFound` for a code with no live game.

It reads `IGameReadService.GetById`, whose registry lookup is exactly the set of games a joiner can reach; adding a
second read path would risk it drifting from the join path it is meant to predict. Covered by service-level tests for
the three cases.

### Client

- `fetchGameRuleset(gameCode)` in the game API: `IGameRulesetBindingResponse | null`, with a `404` resolving to
  `null` instead of throwing, since "no such game yet" is an ordinary state while a code is being typed.
- `useGameRulesetByCodeQuery(code)`: enabled while the trimmed code is non-empty, `staleTime: Infinity` (a binding
  never changes once minted), one retry. The request carries the code exactly as typed, because codes are
  case-sensitive server side; only the cache key folds case, matching the note already in that file.
- The lookup is debounced about 250 ms so typing `ABCDE` does not fire five requests, but once a format is in hand the
  evaluation stays live for every deck change while the code remains in the field. Clearing the code disables the
  query, so the target format - and the judgement - disappears with it.

### Joining

- Before `joinGameAsPlayer`, if the table's format is known and the selected deck fails it, the join is refused on the
  spot with a toast naming the format: `This match is played in {{ruleset}}, and your deck does not fit it.`
- If the code is complete and its lookup is still in flight, the submit waits for the lookup rather than letting the
  server produce the same verdict later.
- When no format is known (unbound game, unknown code), joining keeps today's behaviour: an imported deck must be
  legal in some active format, and the server remains the final judge.

## Strings

Added: `auth.deckSummary.legalFor`, `auth.deckSummary.illegalFor`, `auth.deckSummary.checking`,
`auth.deckSummary.importedDeck`, `auth.toasts.deckNotLegalForJoinedGame`.
`deckRules.status.validForFormats` and `invalidForAllFormats` stay for the import dialog. The
`login-deck-format-status` test id is retired in favour of a new `login-deck-summary` one.

## Coverage

- `e2e/login.deck-import.spec.ts`: the summary row replaces the old format-status assertion, showing the leader name
  and the verdict for the quick-match format.
- `e2e/create-game.share-link.spec.ts`: mocks `/api/games/{code}/ruleset`; asserts the summary row follows the typed
  code's format, that a violating deck is refused with the toast naming the format and no join request, and that a
  fitting deck joins.
- `e2e/matchmaking.quickmatch.spec.ts`: the summary row reports legality against the queued format.

## Deliberate limits

- Card counts are gone from the picker as well as the summary. They bought nothing at selection time, and the deck is
  judged and named by other means.
- An unbound game cannot be pre-checked, because it has no format by design.
- The code lookup returns the binding, not the full format definition, so the evaluation uses the matching active
  ruleset from the list the picker already loads. A format deactivated after its game was created therefore has
  nothing to evaluate with, and the check falls back to the server.
