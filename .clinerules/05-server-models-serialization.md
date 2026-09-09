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

## Testing notes

- `dotnet build server/…` and targeted tests (`GameStateResponseMapper*`,
  `CardRuntimeEffectDuration*`) are the quick server gates. Some unrelated mapper
  tests were observed failing on the feature branch (Recovery chakra disabled
  reason / quick-support windows / rush battle-action availability) — check whether
  they pre-exist before attributing them to a change.
