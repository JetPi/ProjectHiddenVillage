# Create Game: ruleset-bound invites with a share dialog

## Problem

Create mode still behaved like the pre-matchmaking login form: it asked the player to type a game code that the
server then ignored (`CreateGameForUserRequest` carried only `userId` and `deckId`), validated the deck against
"legal in some active format" rather than the format the player would actually play, and dropped them straight onto
the board. The code only ever became visible once they were inside the game, in the sidebar, which is the worst
moment to hand it to an opponent - the creator has already sat down and the board covers the screen.

## What was built

### 1. The format travels with the invite

- `CreateGameForUserRequest` gains an optional `RulesetId`. `GameInstanceService.CreateGameForUser` resolves it
  **before** the game is minted: it loads the active ruleset definition (`DeckRulesetService.GetActiveRulesetDefinition`,
  so a missing or deactivated format is an error rather than "allow it") and judges the creator's resolved deck with
  the same `IGameRulesetDeckValidator` the queue uses. An illegal deck is refused with
  `Game.Ruleset.DeckIllegal` and no game is created.
- On success the game is stamped with `GameRulesetBinding(Id, Key, Name)`, i.e. exactly what quick match does. That
  binding is what `JoinGameForUser` already enforces, so a stranger holding the invite code is admitted only with a
  deck that fits the creator's format. A request without a ruleset id stays unbound, which keeps every existing
  caller (e2e helpers, development seeders, the engine tests' bare composition) behaving as before.

### 2. Create mode shows the same ruleset list as quick match

- `isRulesetSelectionMode(mode)` in `client/src/views/login/configs/LoginView.tsx` marks quick match and create as
  the two format-driven modes. Both now render the same select, built from `useActiveDeckRulesetsQuery`, and both
  auto-select the first active format. The per-mode game code entry config is gone; only `joinGameCodeFieldConfig`
  remains, because only join types a code.
- Queue depth is attached to a format row only in quick match (`showsQueueDepth`). It counts players waiting to be
  paired, which says nothing about a table the player is about to open themselves.
- `quickmatchDeckEvaluation` became `rulesetDeckEvaluation`: the deck is judged against **only** the selected format
  in both modes, the import dialog names just that format, and the "legal in some active format" rule is now join
  only. The store comment in `loginViewStore` records that create holds a ruleset id, not a code.
- When that judgement fails the toast is a single line (`showRulesetDeckRejectedToast`). For an imported deck it
  points at the import view, where the violations are rendered, rather than quoting them. A server refusal under a
  ruleset mode (HTTP 400: the deck/format verdict and nothing else, at that point) shows the same line instead of
  pasting the server's joined violation list into the toast.

### 3. Share before you sit down

- `Enter Game` in create mode mints the game immediately and then **stops**: `createdGameShare` holds the real,
  already-joinable code and the ruleset name, and `CreateGameShareDialog` takes over the screen.
- The dialog mirrors `MatchmakingSearchDialog` (same overlay, panel and button vocabulary) and shows the code, the
  absolute invite link (`buildGameInviteLink` → `/game/{code}` on the current origin) and all three actions in one
  row: copy code, copy link, enter. `copyTextToClipboard` uses the async Clipboard API and falls back to a hidden
  textarea + `execCommand` so the buttons keep working on plain-http deployments and in browsers that refuse the
  modern API.
- Navigation happens from the dialog's `Enter Game`, which is the same hand-off create always used
  (`setSession` → `navigate(toGameRoutePath(gameId))`). Deliberately no dismiss button: the game exists, and the
  creator's only way back into it is the code they are being shown.

### 4. The creator is handed over when an opponent sits down

- The dialog polls its own game (`useGameOpponentJoinedQuery` → `GET /api/games/{code}/state`, every 2s, stopping
  once two players are present) and calls the same hand-off the moment a second player appears. The creator never
  has to sit on a stale screen while the game starts around them.
- It is a poll and not a hub subscription on purpose: `SubscribeToGame` also registers the connection as a watcher
  of the game, and the engine's phase presentations wait on watchers to acknowledge. A login page sharing a code is
  not watching a board, so it must not count as one.
- **The request carries the code exactly as the server returned it.** Only the react-query cache key folds case
  (`gameStateQueryKeys.byCode`). The registry keys game codes with `StringComparer.Ordinal`, generated codes are
  upper case, and `GameReadService.GetById` only trims - so a lowercased lookup answers `Game.NotFound` for a game
  that exists, and the hand-over silently never happens. `GetById_IsCaseSensitive_SoCallersMustSendTheCodeTheyWereGiven`
  pins that contract server side.
- Polling keeps running in a background tab (`refetchIntervalInBackground: true`): the creator waiting for a friend
  is exactly the person whose tab is elsewhere.
- If the check itself can no longer succeed (the game is gone, or the creator is no longer a player of it), the
  dialog replaces the wait with a failure note and a `Back` action instead of waiting forever.

## Deliberate limits

- The dialog is not persisted. A reload before confirming loses the code from the screen (the game itself is
  in-memory and would be stranded anyway); the invite link is still on the clipboard if it was copied.
- Hand-over latency is bounded by the poll interval (2s), which reads as immediate to a human. The creator can
  always press `Enter Game` instead of waiting.

## Coverage

- `GamesServiceUserDeckFlowTests` covers the server half: a bound create stamps the binding, an unbound create stays
  unbound, a deck that does not fit the requested format is refused, and a joiner holding the invite with an illegal
  deck is refused by the same `Game.Ruleset.DeckIllegal` check.
- `e2e/create-game.share-link.spec.ts` covers the client half with the network mocked (ruleset list, presence,
  catalogue, guest session, deck write, the create call and the dialog's state poll), so it can use a two-card
  format: the create request carries the selected `rulesetId`, the dialog shows the returned code plus the invite
  link, both copy buttons place their text on the clipboard, `Enter Game` leaves the login view for `/game/{code}`,
  and a state poll that reports a seated opponent hands the creator over without any click.
