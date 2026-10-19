# Server

## Stack

- .NET SDK
- ASP.NET Core Minimal API
- Swagger (Swashbuckle)

## Run locally

```bash
dotnet watch run --project ProjectHiddenVillage.Server.csproj --urls http://127.0.0.1:3001
```

The server starts on http://127.0.0.1:3001.

## Health endpoint

- GET /health

## API documentation

- Swagger UI: http://127.0.0.1:3001/docs/
- OpenAPI JSON: http://127.0.0.1:3001/docs.json

## CORS

- Local development is automatically allowed from loopback frontend origins (`localhost` and `127.0.0.1`) on any port.
- For non-loopback clients, add explicit origins in `appsettings.json` under `Cors:AllowedOrigins`.

Example:

```json
"Cors": {
  "AllowedOrigins": [
    "https://your-frontend.example.com"
  ]
}
```

Example response:

```json
{
  "status": "ok",
  "service": "project-hidden-village-server",
  "timestamp": "2026-07-18T15:10:46.613Z"
}
```

## Build

```bash
dotnet build ProjectHiddenVillage.Server.csproj
```

## Development Seeding Isolation

- Normal development startup seeds only the `default` profile from `test-data/seed-profiles.json`.
- This preserves the manual-testing baseline decks (the original two 31-card decks).
- Test-only profiles are excluded unless explicitly enabled with `PHV_INCLUDE_TEST_SEED_PROFILES=true`.
- **Startup seeding never modifies a card that already exists** — it creates the ones that are missing and
  leaves the rest alone. The admin editor writes the same table, so applying the seed file over authored rows
  is what once reverted every uploaded image to its catalogue URL on the next cold start.
- A regenerated `test-data/seed-profiles.json` therefore does not reach a database that already has those
  cards. Set `PHV_RESEED_OVERWRITES_EXISTING=true` when replacing them is what you want — it is the only path
  that writes over stored cards.

## E2E Dedicated Database

- E2E server startup uses a dedicated database via `scripts/e2e-start-server.sh`.
- The script sets:
  - `PHV_INCLUDE_TEST_SEED_PROFILES=true`
  - `ConnectionStrings__DefaultConnection` to an e2e-specific DB
- It runs `dotnet ef database update` before launching the server.

Default e2e DB settings:

- Host: `localhost`
- Port: `5432`
- Database: `project_hidden_village_e2e`
- Username: `postgres`

Override with environment variables:

- `PHV_E2E_DB_HOST`
- `PHV_E2E_DB_PORT`
- `PHV_E2E_DB_NAME`
- `PHV_E2E_DB_USER`

## Card Mapping Notes (2026-08)

This branch added a datasource-to-domain mapping flow for card imports and an upsert persistence path.

- Endpoint: `POST /api/card/seed`
- Input: `List<CardDataSourceRecord>`
- Output: mapped `List<Card>`
- Requires the `CardCatalogAdmin` claim, like every other write into the catalogue.

### Implemented

- Added raw datasource DTO `CardDataSourceRecord` (separate from runtime `Card`).
- Added mapper `CardDataSourceMapper`:
  - Maps datasource cards into `Card`, `LeaderCard`, or `CharacterCard`.
  - Copies `Image` into `Card`.
  - Extracts effect condition keywords from bracket tags (for example `[Activate: Main]`).
  - Extracts support names from support headers (for example `[Support] [8-Trigram] Air Palm<br>` -> `SupportName = [8-Trigram] Air Palm`).
  - Adds generic named card reference condition (`Named Card Reference`) for bracketed card names like `[Naruto Uzumaki]`.
  - Uses compile-time generated regex via `GeneratedRegexAttribute`.
- Added card catalog persistence model and upsert flow:
  - `CardCatalogEntry` + EF configuration + migration `AddCardCatalogEntries`.
  - `CardMappingService.MapCards` inserts unknown card IDs and selectively updates existing rows.
  - Update behavior preserves existing DB values when incoming source values are missing/null.

### Validation

- Build:

```bash
dotnet build server/ProjectHiddenVillage.Server.csproj
```

- Targeted tests:

```bash
dotnet test server/tests/ProjectHiddenVillage.Server.Tests/ProjectHiddenVillage.Server.Tests.csproj --filter "CardMappingServiceTests|CardDataSourceMapperTests"
```

### Deferred / Follow-up

- Enum JSON response serialization as strings (currently deferred).
- Additional normalization rules for optional upstream fields may still be needed.
- Review lingering EF Core relational package version warning in test output (`10.0.4` vs `10.0.9`).

## Card Catalogue Listing (2026-10)

- `GET /api/card/catalog` is the listing, and it is deliberately lean: `CardCatalogListItemResponse` carries
  `id`, `displayName`, `type`, `color`, `image` and `imageVersion` - exactly what a rail tile renders. The whole
  card (effects, traits, conditions) comes from `POST /api/card/catalog/by-ids` when one is selected, which is
  the editor's detail fetch. Do not widen the listing to save that fetch: the row is wide with `jsonb`.
- Filtering happens in SQL: `search` (card id and display name, case-insensitive substring), `types` and `colors`
  (repeatable; the readable values the listing returns, e.g. `types=EX Character&colors=N/A`), plus `sort`,
  `page` and `pageSize` (capped at 100). An unmappable type or colour is a 400, not a silently empty page.
  `totalCount`/`totalPages` describe the filtered set.
- The table carries the indexes those paths need (`DisplayName`, `Type`, `Color`, `UpdatedAtUtc`, and the unique
  `CardId`). The expression index `upper("CardId") INCLUDE ("Image","UpdatedAtUtc")` is hand-written in the
  `AddCardCatalogIndexes` migration and is deliberately absent from the EF model: every card lookup is written as
  `upper("CardId") = @id`, which a plain index cannot serve, and the `INCLUDE` is what keeps `/api/card-art/{id}`
  from scanning a table full of `jsonb` on every image request. Measured on the dev database with
  `EXPLAIN (ANALYZE, BUFFERS)`: seq scan with 20 shared buffers before, index scan with 2 after.
- Deferred with triggers rather than built: keyset paging (~10k rows), `pg_trgm` for substring search (measure at
  ~10k), an in-memory card cache, sharded art directories (~100k files), a scheduled paginated sweep and an upload
  queue for bulk imports.

## Game State Action Options Contract (2026-08)

The game state response now supports two action scopes:

- Global game actions: `GameStateResponse.AvailableActions`
- Per-card actions: `CardInstanceResponse.AvailableActions`

### Where per-card actions are populated

Per-card `AvailableActions` are currently evaluated in `GameStateResponseMapper`, a
`static partial` class split by concern in `server/Api/Services/Games/`
(`.Shared` = statics/consts/id compare, `.PhaseActions` = global phase options,
`.Zones` = player-zone + card projection, `.CardActions` = per-zone dispatch +
phase gates, `.HandActions` = summon/set-support, `.SupportActions`,
`.BattleActions`, `.LeaderActions`, `.EffectAvailability`, `.EffectLabels`). The
entry file only holds `ToGameStateResponse` plus the prompt/attack projections.
Emitted for:

- `Hand`
- `SupportZone`
- `CharacterField` (battlefield)

All other zones currently return empty card actions.

### Visibility and gating rules (current backend behavior)

- Card actions are only emitted for the requesting player's own cards.
- Card actions are only emitted during `ActionStep`.
- Card actions are only emitted for cards controlled by the current priority player.
- If a pending prompt exists, card actions are suppressed until prompt resolution.

### Current action id conventions

- Hand card: `play-card:{instanceId}`
- Support card: `activate-support:{instanceId}`
- Battlefield card: `battle-action:{instanceId}`

### Frontend integration guidance (for follow-up issue)

When wiring UI later:

- Read `availableActions` from each card object in hand/support/battlefield.
- Use `actionId` as the stable interaction key.
- Render `label` as button text.
- Respect `isEnabled` and optional `disabledReason`.
- Keep support for global `GameStateResponse.AvailableActions` in parallel with card-level actions.

### Submit path note

Only global actions and prompt resolution are currently executable through hub methods.
Card-specific submit methods are intentionally not added yet in this work item.
