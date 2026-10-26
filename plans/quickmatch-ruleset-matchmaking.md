# Quick Match: ruleset-driven matchmaking (with guest play)

## Problem

Quick Match was a stub: the login view hard-coded one option (`casual`) and navigated to `/game/casual`, a code
no game instance could ever have (the registry only accepts 5-character alphanumeric codes). Separately, every
mode demanded an account, which contradicts the product rule that an unlogged visitor is a **guest**: a display
name is enough, they may import a deck or use a public deck, they cannot save decks, and they must be able to
reach every game mode.

## What was built

### 1. Guest identity (prerequisite)

- `users` gains `IsGuest`, `CreatedAtUtc`, `LastSeenAtUtc` plus a partial index on `LastSeenAtUtc` filtered to
  guests (migration `AddGuestUsers`).
- `POST /api/user/guest` mints a guest from a display name and returns the same `LoginResponse` shape as a login,
  so the rest of the app treats a guest exactly like a signed-in player. The token carries a `guest` claim and
  never the admin claim, and no email claim (the row's synthetic `guest+{id}@guests.invalid` address exists only
  to satisfy the required unique `email` column).
- Guest sessions reuse the existing auth-session store, so a returning browser keeps its identity. Renaming mints
  a new identity, which is safe because a guest owns nothing durable.
- `RegisteredUser` authorization policy (`authenticated && !guest`) guards deck creation; the admin deck
  endpoints already exclude guests because guests never carry the admin claim. `VerifyLogin` refuses guests, and
  the user listing filters them out.
- Deck resolution stayed single-path: a guest's imported deck is a normal transient `decks` row owned by the
  guest, and public decks resolve exactly as they do for anyone else.

### 2. Guest retention (the "will they clutter the database?" answer)

- `GuestUserSweeper` runs on a timer (`Guests:SweepIntervalMinutes`, default 60) and deletes guests whose
  `LastSeenAtUtc` is older than `Guests:RetentionDays` (default **7**), in batches of
  `Guests:SweepBatchSize`.
- **Guest decks are deleted before the guest row.** `decks.user_id` is `ON DELETE SET NULL`, so removing the
  user first would leave ownerless decks that no retention rule would ever collect again.
- `LastSeenAtUtc` is refreshed on session mint and on entering a game or the matchmaking queue, throttled by
  `Guests:TouchThrottleMinutes` (default 10) so an active guest costs one write every ten minutes, not one per
  request.
- Consequences: growth is bounded by "guests abandoned in the last week", not by total visits; guests can never
  have a durable win/loss record, which is why the flag is stored rather than inferred.

### 3. Ruleset-bound games

- `GameRulesetBinding(Id, Key, Name)` travels on the runtime `GameInstance` and is published on
  `GameStateResponse.Ruleset`, so a client can name the format.
- `IDeckRulesetService.GetActiveRulesetDefinition(id)` loads the evaluable definition (missing or deactivated is
  an error, never "allow it").
- `IGameRulesetDeckValidator` adapts a `ResolvedPlayerDeck` into `DeckRuleCard`/`DeckRuleCardMetadata` and calls
  the existing `DeckRulesetRules.EvaluateRuleset`, so the verdict is the same rule engine the admin tools use and
  covers exactly the cards the engine will play with.
- `GameInstanceService.JoinGameForUser` validates a joiner's deck against the game's binding, so a quick-match
  game cannot be entered by code with a deck that does not fit its format. Create-mode games carry no binding and
  behave exactly as before.

### 4. Matchmaking

- `POST /api/matchmaking/queue { userId, deckId, rulesetId }`: loads the active ruleset, resolves the deck,
  validates it **before** taking a queue slot, then pairs with the oldest waiting ticket **in the same ruleset**.
  On pairing the game is created with both players at once (`registry.Create([p1, p2], mergedDefinitions)`),
  bound to the ruleset, and both tickets are marked `matched` with the game code.
- `GET /api/matchmaking/queue/{ticketId}` reports `waiting | matched | cancelled | expired` (owner only);
  `DELETE` cancels a waiting ticket and leaves a matched one alone.
- Tickets live only while waiting (`Matchmaking:TicketLifetimeSeconds`, default 120) and are pruned lazily on
  every enqueue/status read; finished tickets are kept briefly so a polling client can still read the outcome.
- A second enqueue from the same player replaces their previous ticket, so one player can never be paired twice.

### 5. Client

- The Quick Match select lists the active rulesets (`useActiveDeckRulesetsQuery`) and defaults to the first one.
- The deck is evaluated against **only** the selected ruleset in quick match (`evaluateRuleset`); create and join
  keep the long-standing "legal in some active format" rule. The import dialog receives just that ruleset while
  queueing, so its pills name the format being queued for.
- Submitting quick match ensures an identity, resolves a deck (import creates a transient deck, saved/public use
  the selected id), enqueues, and shows `MatchmakingSearchDialog` (ruleset name, elapsed time, cancel) which polls
  the ticket and navigates on `matched`. The ticket id is kept in `sessionStorage` so a reload resumes the search
  instead of silently leaving a ticket behind.
- Guests see an account hint when they open saved decks; import and public decks remain fully available.

## Operational notes

- Development databases need `npm run db:migrate` once; the e2e stack applies migrations itself
  (`scripts/e2e-start-server.sh`).
- `Matchmaking:*` and `Guests:*` are configuration sections; retention must stay far above any single test run.

## Header and e2e coverage

- The board sidebar renders `GameStateResponse.Ruleset.Name` above the join code (`data-testid="game-ruleset-name"`),
  so both players can see the format they are playing. Unbound games render nothing, which keeps seeded and
  create-mode games visually unchanged.
- `e2e/matchmaking.quickmatch.spec.ts` exercises quick match with the network mocked: the ruleset list, the catalog
  lookups, the guest session, the deck write and the matchmaking endpoints are all stubbed. That lets the spec use
  a two-card format instead of writing throw-away rulesets (and 50-card decks) into the shared e2e database. It
  covers the format select, an illegal deck being refused with no queue call, the wait dialog with its elapsed
  timer, cancelling a ticket, and the hand-off into the matched game. The server-side pairing rules stay covered by
  `MatchmakingServiceTests`.
