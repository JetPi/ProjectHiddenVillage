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
- `GameStateResponse.SupportChain` is a trailing **optional** param (default `null`) so existing constructor
  call sites keep compiling; the client reads `supportChain ?? []`. It is rebuilt from
  `EffectResolutionStack` (activations only, oldest first) on every push, and the source/target display names
  are resolved from `CardDefinitions` by locating the instance across the player's zones — a hand activation's
  card already sits in the trash, and a chain-entry target *is* the source card of the entry it negates.
- Engine stats live on `CardInstance` (`PowerOverride/DamageOverride/
  HealthOverride/CurrentHealth`) and `LeaderCardInstanceState`
  (`Power/Damage/TotalLife/CurrentLife`). `LeaderCardInstanceState` now **derives from
  `CardInstance`**, so it inherits identity fields plus `IsRested/IsExhausted/
  RuntimeKeywords` — anything resolving an acting card must accept battlefield **or** leader
  (registry `FindOwnedCardInstance` / `FindCardInstanceWithOwner`).
- **Two deliberate defence pipelines — do not unify them:**
  - Character health = effective max health (`ResolveEffectiveHealth`) − damage taken this
    turn, reset at the turn boundary (`ResetTemporaryCharacterDamage`); dealt by an attacker's
    **POW**.
  - Leader life is chipped only by an attacker's **DMG** via `ResolveEffectiveLeader*` and
    never resets (only card effects restore it). Healing may push `CurrentLife` **above** the
    printed maximum (`TotalLife`) — `ValidateInvariants` only rejects negative life, deliberately
    leaving an upper cap as an open rule question (`GameInstanceLeaderLifeInvariantTests`).
- Attack stats resolve exactly like the numbers the client is shown: leader attacker →
  `ResolveEffectiveLeaderPower/Damage`; character attacker →
  `ResolveEffectivePower/Damage` (registry `ResolveAttackPower`/`ResolveAttackDamage`).
- `IsExhausted`/`isExhausted` means the card left play (exile zone) — never “rested”, and
  leaders can never be exhausted. The wire field survives but is always false; do not build
  behaviour on it, and do not re-add the `ZoneCardProperty.IsExhausted` predicate.

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
- **`CardImage` is the only image component to use** (`components/ui/cards`).
  For catalog art pass `card` + `variant` (`'board'` = 240 for all in-game faces,
  `'preview'` = 600 for popups) and it auto-builds the cached width-capped URL —
  a card keeps one URL across zone moves and never reloads its image. Local/
  static art uses `src`. The component always applies `image-rendering: auto`
  (override via `imageRendering` only when truly intended) and supports explicit
  `width`/`height`. Helper `cardArtUrl`/`resolveCardArtUrl` in `cardArt.ts`
  remains available for view-model resolvers
  (`utils/functions/cards/index.ts`) that bake the board-width URL into `image`.
- **Eager per-game preload** (`useCardCatalogPreload` in
  `hooks/GameView/effects/useGameViewEffects.ts`) fetches art for every catalog
  card in the game through the resize endpoint, in priority batches: visible
  board/own-hand faces (board 240) → same faces at preview 600 → remaining
  deck/trash/opponent-hand cards (board 240). Batches resolve sequentially;
  `imagePreloadCache` dedupes by URL. This makes first-time preview popups
  instant instead of loading on hover.

## Seed fixtures & the real card catalogue (test data)

- `test-data/seed-profiles.json` is the only hand-written card source: `catalogEntries` holds
  every card referenced by a `profiles[].decks` card id, and `scripts/e2e-start-server.sh` seeds all
  profiles (`PHV_INCLUDE_TEST_SEED_PROFILES=true`) while normal dev startup seeds `default` only.
- `catalogEntries` is **generated from `server/Api/rawCardCatalogDump.txt`** (the real catalogue:
  `N-001…N-022` plus `C-*`/`S-*`/`SAMPLE-*` rows no deck uses). Regenerate by rebuilding
  `catalogEntries` from the dump for every id a profile references; keep the dump in-repo so the
  manifest stays reproducible. Only `catalogEntries` is generated — `profiles`/`decks` are
  hand-authored, so preserve them, and sanity-diff the regenerated entries against the current ones
  (`grep -c 'Is Rested' test-data/seed-profiles.json` should stay 2, deck card ids unchanged)
  instead of overwriting blind. **`T-120` is the only non-real fixture** (Character, power 10, no
  effects) because Gamabunta's `Power >= 10` rule needs a normally-summonable ≥10-power character and
  the real catalogue has none (N-003/N-005/N-014 are EX + `cannotBeNormalSummoned`).
- `DevelopmentDeckSeeder` **upserts** those definitions for referenced ids (the manifest wins over
  existing rows) and only fabricates placeholders for ids that are still missing —
  `SeedPlaceholderCatalogEntriesAsync` skips ids already present, so real imported rows are never
  overwritten. `PlaceholderLeaderCardIds`/`PlaceholderSupportCapableCardIds` are that fallback only and
  are dormant now, so
  `DevelopmentDeckSeederTests.SeedAsync_CreatesSupportCapablePlaceholder_ForN008_WhenCatalogIsMissing`
  has a stale name (N-008 always resolves from the manifest; its assertions still pass).
- e2e/CI must not depend on the external art host: `scripts/e2e-start-server.sh` exports
  `CardArt__SourceHostAllowlist__0="e2e.invalid"`, which makes `/api/card-art` refuse the real host
  **without any network call** (verified: 404 in ~0.1 s) so `CardImage` falls back deterministically.
  Use the indexed (`__0`) env form — a comma-less single value is not a reliable `List<string>` binding.

## Card data authoring: runtime effect types (admin view + validator)

- A new behaviour is a `RuntimeEffects` enum member whose name matches the effect class's `EffectTypeKey`
  (`RuntimeEffectKeys.TryResolve` maps enum → key → `GameCardEffectRegistry`; the class is registered in
  `Program.cs`). Its admin label is the split-Pascal name, listed in the admin view's `RUNTIME_EFFECT_OPTIONS`
  (`views/admin/constants/effectOptions.ts`) — the request model deserializes that string through the flexible
  enum converter, so label and enum member must stay in sync.
- `UpdateCardEffectsRequestValidator` owns each type's authoring contract. Example: `Lock Chakra Recovery`
  (N-016's “you cannot turn your CHAKRA face-up”) requires a non-instant duration, requires
  `Execution Target Source: None` (it locks the players in `TargetRange` instead of picking a card) and must
  not carry any other payload.
- The admin view enforces the same contract while authoring: `CardAdminEffectsSection` sets
  `Execution Target Source = None` when the type is selected, and `CardAdminExecutionPanel` warns — with a
  one-click “Set Execution Target Source to None” — whenever an effect says `Selected Targets` while declaring
  no selectable target rules. That combination is what made N-016 unplayable
  (“No valid targets available.”) and is rejected by the validator for the new type.

## Admin dropdowns (`CardAdminSelect`)

- **Never a native `<select>`** in the admin view. On Linux the native popup can commit whichever option ends
  up under the cursor the moment it opens, so a single click picked a value instead of just opening the list
  (the reported “it instantly selects whatever is in the middle”). `CardAdminSelect`
  (`views/admin/components/controls/`) is a custom listbox: it opens on the first click and only chooses on a
  click whose own pointer press started inside the list (`pressStartedOnTriggerRef`), with Escape/outside-click
  to close and Arrow/Home/End/Enter/Space keyboard support.
- API: `value` + **`onValueChange(value)`**, options declared as `<option value="…">Label</option>` children
  (read by `readOptions`, so call sites still read like a native select). `className` styles the **trigger**,
  like it did on the native element.
- **The list is portalled to `document.body`** and positioned `fixed` from the trigger rect
  (`resolveListboxBox` / `resolveListboxStyle`): it flips above a trigger with no room below, shrinks its
  `max-height` to the space available, clamps into the viewport and is re-measured on scroll/resize. That is
  what keeps it out of the detail pane's scroll container, which used to slice open dropdowns at its edge —
  do not go back to an in-flow `absolute` list.
- `FormSelect` (`components/forms/`) is the same idiom for the auth/forms flows; there is no native `<select>`
  left anywhere in `client/src`. `e2e/admin.card-editor.spec.ts` pins the geometry (portalled list fully
  inside the viewport, header rows neither overflowing nor clipping their controls, sections drawing no box).

## Admin card editor layout (flattened sections)

- **One surface per effect, no card-in-card-in-panel.** The detail pane draws the outer card, each effect is a
  single `rounded-lg border bg-[var(--surface)]` card, and the panels inside it (`CardAdmin*Panel`) are
  divider sections: `group border-t border-[var(--border-subtle)] border-l-2 border-l-<colour>-500/55 pl-3 pt-3`
  (no rounding, background or padding box). Repeated rows inside a panel use
  `border-t border-[var(--border-subtle)] pt-2` or the accent-rule indent only. Border/background boxes are
  reserved for actual controls (inputs, selects) and semantic messages (the amber authoring warning).
- The effect header is **one row** (`flex flex-wrap`): identity (remove, effect id), branch wiring (✓/✕ selects)
  and the flags (Ch/Opt/Sub chips) then a trailing `ml-auto` group with the collapse toggle and the drag
  handle. It stays a single line on a desktop-width rail (~1600px+ viewport, the admin's normal window) and
  only wraps as groups on genuinely narrow rails. The previous `flex-nowrap overflow-hidden` version sliced
  off whatever did not fit, so never reintroduce `overflow-hidden` (or `nowrap`) here; the id input and both
  selects carry `min-w-[4.5rem]` so the row stays compact and wraps instead of collapsing.
- The editor container keeps `mb-16` so the last section clears the floating Save button.

## Testing notes

- `dotnet build server/…` and targeted tests (`GameStateResponseMapper*`,
  `CardRuntimeEffectDuration*`, `EffectTargetResolverTests`) are the quick server gates.
- **7 pre-existing failures** are expected in the full suite; they fail identically with your change
  reverted (stash only your own edits and park new untracked files to confirm). Verified baseline:
  `Failed: 7, Passed: 384, Total: 391`, and the seven are:
  `GameEffectCanExecuteEvaluatorTests.Evaluate_ReturnsCannotExecute_WhenExactCountIsCombinedWithMinimumOrMaximum`,
  `GameStateResponseMapperCardActionsTests.ToGameStateResponse_DoesNotMapBattleAction_ForCardSummonedThisTurnWithoutRush`,
  `…_ForRestedCard`, `…_ForCardWithCannotAttackKeyword`,
  `…_EnablesOpponentQuickSupport_InActionStepCutInWindow`,
  `…_DisablesRecoveryLeaderEffect_WhenAllChakraCardsAreFaceUp`, and
  `InMemoryGameInstanceRegistryTests.GetCardActionTargets_LeaderEffect_ReturnsPrecomputedTargets`.
  Totals drift as tests are added — compare *names*, not counts.
