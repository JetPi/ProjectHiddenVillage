# Fix: the creator is never handed over to their own created game

## Symptom

A created game is joinable: the second player pastes the code, sits down, and the board opens for them. The
creator, parked on the share dialog, never moves - the dialog keeps saying "Waiting for your opponent to join."
even though the seat is taken and the game is waiting for them.

## Root cause

The share dialog's poll asks the server about the wrong game code.

- [`useGameOpponentJoinedQuery`](client/src/services/queries/gameStateQueries.ts:31) normalizes the code with
  `.toLowerCase()` and calls `fetchGameState(normalizedJoinCode)` with the lowercased value.
- The server's game registry is case **sensitive**: [`InMemoryGameInstanceRegistry`](server/Engine/Services/InMemoryGameInstanceRegistry.cs:51)
  is a `ConcurrentDictionary<string, GameInstance>` built with `StringComparer.Ordinal`, generated codes use
  uppercase only (see the comment at [`InMemoryGameInstanceRegistry.cs`](server/Engine/Services/InMemoryGameInstanceRegistry.cs:13)),
  and [`GameReadService.GetById`](server/Api/Services/Games/GameReadService.cs:179) only `.Trim()`s the argument.
- So every poll hits `/api/games/{lowercased}/state` and gets `Game.NotFound`. `players` never arrives, the query
  stays in error, `refetchInterval` keeps retrying a request that can never succeed, and the hand-over effect never
  fires. The joiner is unaffected because they type the exact code the dialog displays.

Why the tests did not catch it: the e2e state mock matched any code (`/api/games/[^/]+/state`), so it happily
answered the lowercased path with a two-player payload.

Two secondary problems share the same screen:

- `refetchIntervalInBackground: false` pauses the poll whenever the creator's tab is not focused - which is the
  normal state while they are messaging the friend they just invited.
- A poll that can never succeed fails silently: the dialog shows a wait that will not end.

## Fix

1. **Ask with the code exactly as received.** In `useGameOpponentJoinedQuery`, keep `joinCode.trim()` for
   `fetchGameState` and use the lowercased form only as the query cache key (`gameStateQueryKeys.byCode` already
   lowercases). This is the same split the game route loader uses: raw `params.joinCode` for the request,
   lowercased key for the cache. Add a comment stating the registry is case-sensitive so the next reader does not
   reintroduce the normalization.
2. **Keep polling while the tab is in the background.** `refetchIntervalInBackground: true`: one request every two
   seconds is cheap, and being handed over when you come back to the tab - or immediately, if it is visible - is
   the whole point.
3. **Stop pretending to wait when the wait cannot end.** If the poll fails (game gone, or the creator is no longer
   a player of it), show `auth.createGame.watchFailed` under the code and offer a `Back` action that clears
   `createdGameShare` and returns to the form; that game cannot be entered anyway. Transient errors keep the
   normal wait, and `Enter Game` stays available throughout.
4. **Make the e2e able to fail.** Match the state route on the exact uppercase code
   (`/\/api\/games\/E2EBB\/state$/`) and assert the captured request paths, so a lowercased request falls through
   to the API and breaks the hand-over test instead of being answered by the mock. Add a case where the state read
   fails: the dialog shows the failure note and `Back` returns to the form without navigating.
5. **Pin the server constraint with a test.** A `GamesServiceUserDeckFlowTests` case asserting
   `GetById` on a lowercased code returns `Game.NotFound` documents why the client must not fold the case, so a
   future "normalize it in the service" change fails loudly.
6. **Record it.** Add the case-sensitivity rule and the background-poll note to
   [`plans/create-game-share-link.md`](plans/create-game-share-link.md).

## Not in scope

Making game codes case-insensitive end to end (registry comparer, hub normalization, dev-seeded mixed-case codes
such as `Ab12C`) is a separate decision with its own migration risk; the client contract is "send the code exactly
as the server gave it".
