# Server

Minimal backend runtime for Project Hidden Village.

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

## Card Mapping Notes (2026-08)

This branch added a datasource-to-domain mapping flow for card imports and an upsert persistence path.

- Endpoint: `POST /api/card/seed`
- Input: `List<CardDataSourceRecord>`
- Output: mapped `List<Card>`

### Implemented

- Added raw datasource DTO `CardDataSourceRecord` (separate from runtime `Card`).
- Added mapper `CardDataSourceMapper`:
  - Maps datasource cards into `Card`, `LeaderCard`, or `CharacterCard`.
  - Copies `Image`, `OriginalId`, `MainAlternate`, and `Attribute` into `Card`.
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

## Game State Action Options Contract (2026-08)

The game state response now supports two action scopes:

- Global game actions: `GameStateResponse.AvailableActions`
- Per-card actions: `CardInstanceResponse.AvailableActions`

### Where per-card actions are populated

Per-card `AvailableActions` are currently evaluated in `GameStateResponseMapper` for:

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
