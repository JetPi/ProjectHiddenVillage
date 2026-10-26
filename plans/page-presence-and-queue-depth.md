# Page presence and per-ruleset queue depth

## Problem

The login screen showed no sign of activity, and the matchmaking dialog said nothing about how many people were
already waiting in the selected format. Two numbers were wanted:

1. **Players online** — individual people with the site open right now, whether they are on the login screen, in
   matchmaking, or in a game. Not "players connected to a board".
2. **Waiting per ruleset** — how many distinct players are queued in each format, so a player can judge whether a
   format is worth queueing for.

Neither existed. `GamePresenceTracker` cannot answer the first: it maps connections to a *game* so the server knows
who still owes a phase-presentation acknowledgement. Folding site-wide viewers into it would mint acknowledgements
for people who are not on a board. The matchmaking queue held the second number but only behind a request-scoped
service, with no way for a background broadcaster to read it.

## Semantics chosen

- **One viewer is one browser.** The unit is a client-generated viewer id kept in `localStorage`, so two tabs of the
  same browser count once and two browsers count twice. This matches how a person uses the site and makes the
  figure resistant to tab churn.
- **The count is anonymous-friendly.** A guest has no identity until they submit, and those are exactly the viewers
  a queue needs to count, so both the hub and the REST read allow anonymous callers and never require the token.
- **The count is "viewing", not "playing".** It is reported from a connection opened at app start in `main.tsx`,
  above the router, so it is present on every route including the login screen.
- **History is out of scope.** No retention, no per-ruleset time series; the endpoint exposes the current instant.

## Why the viewer id cannot be taken from the token

The development authentication handler authenticates every anonymous caller as one seeded user
(`DevelopmentUserSeeder.SeedUserOneId`), and in production an un-named visitor has no subject at all. A
claim-keyed count would therefore read 1 in development for any number of browsers, and would silently miss people
in production. The presence registry is keyed on the client-supplied viewer id, never on the claim.

The id is validated for shape (8–64 characters, letters/digits/hyphen) and a per-viewer connection cap
(`Presence:MaxConnectionsPerViewer`, default 5) keeps one client from inflating the number. A rejected or capped
connection stays open but is not counted, so a misbehaving client does not break its own page.

## Server pieces

| Piece | Responsibility |
|---|---|
| [`PresenceRegistry`](../server/Api/Services/Presence/PresenceRegistry.cs) | Singleton map `viewerId -> { connectionIds, isAuthenticated }`. `Register`, `Remove`, `GetCounts`. Drops the viewer with its last connection. |
| [`PresenceHub`](../server/Api/Hubs/PresenceHub.cs) | `[AllowAnonymous]` hub at `/hubs/presence`. Reads `viewerId` from the query string, registers on connect, removes on disconnect. Never touches `GamePresenceTracker`. |
| [`PresenceSnapshotFactory`](../server/Api/Services/Presence/PresenceSnapshotFactory.cs) | Builds the single payload both surfaces publish, and compares snapshots list-aware. |
| [`PresenceBroadcaster`](../server/Api/Services/Presence/PresenceBroadcaster.cs) | Hosted service on `TimeProvider`; once per `Presence:BroadcastIntervalSeconds` (default 2) recomputes the snapshot and pushes `PresenceUpdated` **only when it changed**. |
| [`PresenceController`](../server/Api/Controllers/PresenceController.cs) | Anonymous `GET /api/presence`, for first paint and as a fallback while the socket is down. |
| [`MatchmakingQueue`](../server/Api/Services/Matchmaking/MatchmakingQueue.cs) | Owns the waiting summary: prunes expired/finished tickets **under its own lock**, then groups waiting tickets by ruleset and counts distinct users. |

The response contract (`PresenceSnapshot`) is one shape on both surfaces: `onlineViewers`,
`waitingByRuleset[{ rulesetId, rulesetName, waitingCount }]`, plus `authenticatedViewers` and `anonymousViewers` for
diagnostics. A client that paints from REST and then receives the hub event cannot see two different shapes.

### Why pruning moved into the queue

The broadcaster runs outside any request, so it has no `DbContext` and no scope, and a stale ticket must not be
counted as a waiting player. Pruning and summarising therefore live in the same singleton that owns the tickets,
executed under the same lock, and both `GET /api/presence` and the broadcaster read the result through
`IMatchmakingService.GetQueueSummary()` / `MatchmakingQueue.GetWaitingSummary(...)`. Expired and matched tickets are
excluded; duplicate tickets of one user in one ruleset count once.

### Hub-path auth fix

`Program.cs` used to forward the `access_token` query string to authentication only for paths starting with
`/hubs/games`. That check is now the shared `IsHubPath(PathString)` helper, so the new hub can authenticate the same
way and any future hub inherits the behaviour.

## Client pieces

| Piece | Responsibility |
|---|---|
| [`presenceConnection.ts`](../client/src/services/presence/presenceConnection.ts) | `getOrCreateViewerId()` (`phv-viewer-id` in localStorage), one idempotent `startPresenceConnection()`, `withAutomaticReconnect`, silent logging. |
| [`PresenceProvider.tsx`](../client/src/services/presence/PresenceProvider.tsx) | Mounted in `main.tsx` above the router, so the connection exists on every route. |
| [`presenceStore.ts`](../client/src/state/presenceStore.ts) | Zustand store holding the last snapshot and the connection flag. A store, not query state: the figure arrives from a socket and a stale value is still worth showing. |
| [`usePresence.ts`](../client/src/services/presence/usePresence.ts) | `usePresenceSnapshot`, `usePresenceConnected`, `useRulesetWaitingCount(rulesetId)` (null while unknown, `0` when known and empty). |
| [`hubUrl.ts`](../client/src/services/api/hubUrl.ts) | `buildHubUrl(path, query)` shared by both hubs for browser-unsettable query parameters. |

On reconnect the client re-reads `GET /api/presence`, because events published while the socket was down were
missed. On failure it keeps the last known figure rather than blanking it.

### Where the numbers surface

- Login screen: a badge under the title with `data-testid="online-players"` and pluralised copy
  (`auth.onlinePlayers_one/_other`).
- Matchmaking search dialog: how many players are already waiting in the selected format, with
  `data-testid="matchmaking-waiting-players"` (`auth.matchmaking.waitingPlayers_one/_other`). When the snapshot is
  unknown it falls back to copy that quotes no number.

## Constraints and known limits

- Everything here is in-process state, like the game registry and the queue itself: a multi-instance deployment
  would report per-instance numbers unless the registry and queue move to a shared store.
- A viewer is a browser, not a person. Two devices count as two, and clearing storage counts as a new viewer.
- A transport that dies without a clean close (for example a killed browser process) is dropped from the count when
  SignalR observes the disconnect, not instantly.
- The snapshot is pushed at most every `Presence:BroadcastIntervalSeconds`, so the badge can lag by that interval
  and by the reconnect window.

## Verification

- Server: `PresenceRegistryTests` (per-viewer dedupe across tabs, drop on last connection, cap enforcement) and
  `MatchmakingQueueSummaryTests` (only waiting tickets of the ruleset, expired and matched excluded). Full suite:
  819 passing.
- Client: typecheck and lint clean.
- e2e: `e2e/matchmaking.quickmatch.spec.ts` mocks `GET /api/presence` and aborts the presence socket, then asserts
  the badge and the waiting count; `e2e/login.deck-import.spec.ts` and `e2e/gameview.spec.ts` still pass with the
  presence connection present.
- Live check against the real stack with three separate browser contexts: the API reported `onlineViewers` rising
  to 3 as each browser opened the page, and a second tab in an existing browser did not change the number. The
  temporary probe was deleted after the run.
