---
paths:
  - "server/Models/Api/**"
  - "server/Api/Services/Games/**"
  - "client/src/services/api/**"
  - "server/Api/Services/Card/**"
---

# Server response models & serialization gotchas

## STJ polymorphism gotcha (VERIFIED)

- System.Text.Json serializes a base-declared property by its **declared type**.
  A derived instance stored in a `CardInstanceResponse`-typed collection does NOT
  get its derived members serialized unless polymorphism is configured
  (`[JsonDerivedType]`/`[JsonPolymorphic]`) or the declared type is the concrete
  derived type.
- Consequences in this codebase:
  - `PlayerZonesResponse.Leader` works because it is typed concretely as
    `LeaderCardInstanceResponse`.
  - `PlayerZonesResponse.CharacterField` is typed
    `IReadOnlyList<EnrichedCardInstanceResponse>` (not the base) so battlefield
    stat fields reach the wire; `GameStateResponseMapper` casts the mapping result.
- In-process server tests that cast `as EnrichedCardInstanceResponse` will NOT
  catch a wire-level drop — add a JSON-shape assertion when payload shape matters.

## Card instance response records (`server/Models/Api/GameStateResponses.cs`)

- `CardInstanceResponse` (base): identity + `IsFaceUp/IsExhausted/IsRested/
  SupportSlotIndex/IsConcealedFromOpponent/AvailableActions`.
- `EnrichedCardInstanceResponse : CardInstanceResponse` adds `DisplayName, Type,
  Color, Traits, Health, MaxHealth, Damage, Power`.
  - `Health` = resolved current health (`card.CurrentHealth ?? effective base`);
    `MaxHealth` = base definition health; `Damage`/`Power` = resolved
    (`PowerOverride/DamageOverride ?? definition`, plus effect-service resolution
    when a `GameState` is provided).
- `LeaderCardInstanceResponse : CardInstanceResponse` adds `Damage, Power,
  TotalLife, CurrentLife, RecoveryEffect` — resolved via
  `CardRuntimeEffectStateService.ResolveEffectiveLeaderPower/Damage`.
- Engine stats live on `CardInstance` (`PowerOverride/DamageOverride/
  HealthOverride/CurrentHealth`) and `LeaderCardInstanceState`; battle damage
  reduces a defender’s `CurrentHealth` and end-of-turn cleanup resets it to null.

## Client stat pipeline (mirror of the above)

- `IGameCardInstanceResponse` declares the enriched fields as **optional**
  (`health/maxHealth/damage/power/displayName/type/color/traits`);
  `IGameLeaderCardInstanceResponse` carries `damage/power/totalLife/currentLife`.
- View models (`types/hub/viewModels.ts`) expose live values as required numbers:
  non-leader `currentPower/currentHealth/currentDamage`; leader
  `currentPower/currentDamage` (plus `currentLife`).
- Resolvers (`utils/functions/cards/index.ts`) map server values with catalog
  fallback: `card.power ?? catalogCard.power ?? 0`, `card.health ??
  catalogCard.health ?? catalogCard.life ?? 0`, leader via
  `player.leader.power/damage ?? catalog`. Keep instance/live values preferred over
  catalog/base.

## Card art delivery (`/api/card-art`) and `ImageVersion`

- `CardCatalogEntry.Image` stores the **raw external art URL** (imported from the
  external DB). It is an ingestion source only — clients should not render it
  directly for small slots.
- `GET /api/card-art/{cardId}?w=&v=` (allow-anonymous, `CardArtController`)
  lazily fetches the raw URL on cache-miss, downscales with ImageSharp/Lanczos
  (never upscales), re-encodes WebP q85 and writes
  `server/card-art-cache/{cardId}__w{w}__v{v}.webp` (gitignored). Widths are
  whitelisted (`CardArt:AllowedWidths` = 80/120/240/600). Responses are
  `ETag` + `Cache-Control: immutable` when `v` is present, otherwise a short
  `max-age`. SSRF guard: enforce `CardArt:SourceHostAllowlist` (empty = any
  http/https host allowed). `CardArtImageProcessor` is unit-tested.
- `CardCatalogItemResponse` gained a trailing **optional** `ImageVersion` param
  (ms of `CardCatalogEntry.UpdatedAtUtc`) → wire field `imageVersion`. When
  adding optional trailing params to positional response records, give them a
  default so existing constructor call sites keep compiling.
- Client helper `client/src/services/api/cardArt.ts` builds the resized URL
  (`cardArtUrl`/`resolveCardArtUrl`) using `CARD_ART_WIDTHS`
  (hud 120 / board 240 / preview 600; `w=80` reserved for tiny API faces). Board
  view-model resolvers set `image` to the board-width URL; hand faces use hud
  width; preview popups use 600. Keep `image-rendering: auto` on card faces.

## Testing notes

- `dotnet build server/…` and targeted tests (`GameStateResponseMapper*`,
  `CardRuntimeEffectDuration*`) are the quick server gates. Some unrelated mapper
  tests were observed failing on the feature branch (Recovery chakra disabled
  reason / quick-support windows / rush battle-action availability) — check whether
  they pre-exist before attributing them to a change.
