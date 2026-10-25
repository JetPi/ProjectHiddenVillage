# Deck import and ruleset validation

## Goal

Pasting a deck list replaces a deck draft, is validated against every active ruleset before any request leaves
the client, and can only be saved when at least one active ruleset accepts it. The server re-runs the same
evaluation on every write, so a stale client cannot store an illegal deck. Rulesets are data, not constants:
two normalized tables, seeded with the current formats and editable from a new admin screen.

## Agreed decisions

- Input format stays one line per card: `{copies}x {cardId}`, for example `4x N-010`. Blank lines are ignored;
  anything else is a line-numbered parse error. Duplicate lines for one card are summed.
- The ruleset count covers **non-leader cards only**. A deck always needs exactly one leader, one copy of it,
  and that leader is counted separately from `50` / `30`.
- Formats for now:
  - **Standard** - exactly 50 non-leader cards, max 4 copies per non-leader card, 1 leader, every card shares
    the leader's colour.
  - **Pre-Release** - exactly 30 non-leader cards, max 3 copies per non-leader card, 1 leader, same colour rule.
- No ruleset id is stored on a deck. Compatibility is recomputed against all active rulesets on every read or
  edit, and the UI reports each one separately.
- Save is enabled when at least one active ruleset is legal. Every failing ruleset is listed with its own
  reasons; the deck is rejected only when all of them fail.
- The admin import replaces the draft card list and leader slot. Merging pasted lines into an existing draft is
  removed.
- Rulesets live in normalized tables, including banned/limited cards. No JSON payload column.
- Out of scope for this iteration: game creation or join validating the selected deck, ruleset selection per
  game, and format badges on deck rails and pickers.

## Data model

New entities under [`server/Data/Entities/Decks/`](server/Data/Entities/Decks/Deck.cs:1):

| Entity | Columns |
| --- | --- |
| `DeckRuleset` | `Id`, `Key` (unique slug), `Name`, `IsActive`, `LeaderCount`, `NonLeaderCardCount`, `MaxCopiesPerNonLeaderCard`, `RequireLeaderColorMatch`, `AllowChakraCards`, `AllowSummonCards`, `SortOrder`, `CreatedAtUtc`, `UpdatedAtUtc`, `CardRestrictions` |
| `DeckRulesetCardRestriction` | `Id`, `DeckRulesetId`, `CardCatalogEntryId`, `MaxCopies` (`0` = banned, `1..N` = limited) |

- `LeaderCount` is validated to `1` for now but stays a column so the rule is data, not code.
- `NonLeaderCardCount` is an exact size, not a minimum or maximum.
- Effective per-card limit = `min(MaxCopiesPerNonLeaderCard, restriction.MaxCopies)`.
- Restrictions apply to leaders too: a leader restricted to `0` cannot be used, and a leader restriction above
  `1` is capped by the leader rule.
- Configurations: new [`DeckRulesetConfiguration`](server/Data/Configurations/Decks/DeckRulesetConfiguration.cs)
  and `DeckRulesetCardRestrictionConfiguration` in the same folder. Unique index on `Key`, unique index on
  `(DeckRulesetId, CardCatalogEntryId)`, cascade delete from ruleset to restrictions.
- DbSets added to [`ApplicationDbContext`](server/Data/ApplicationDbContext.cs:16).
- Seed the two formats with `HasData` using fixed GUIDs in the configurations, so a fresh database and a
  migrated database agree and both rulesets exist without a startup seeder.
- New EF migration `AddDeckRulesets`.

## Server evaluation

Replace [`PublicDeckRules`](server/Api/Services/Deck/PublicDeckRules.cs:9) with a ruleset-driven pure policy in
`server/Api/Services/Deck/DeckRulesetRules.cs`:

- `DeckRulesetDefinition` carries one ruleset plus its restriction map keyed by normalized card id.
- `DeckRulesetEvaluation` carries the ruleset, `IsValid`, violations, `LeaderCopies` and `NonLeaderCopies`.
- `DeckRulesetValidation` carries every evaluation plus `IsLegalInAnyRuleset`.
- One call evaluates a card list against all supplied definitions. It is pure, so it is unit tested without a
  database.

Violation codes, reused verbatim by the client:

| Code | Meaning |
| --- | --- |
| `Deck.Ruleset.UnknownCards` | one or more ids are absent from the catalogue |
| `Deck.Ruleset.UnsupportedCardType` | Chakra or Summon present while the ruleset disallows it |
| `Deck.Ruleset.LeaderCount` | leader rows do not total the required count |
| `Deck.Ruleset.LeaderCopies` | a leader is not at exactly one copy |
| `Deck.Ruleset.DeckSize` | non-leader total differs from the required exact count |
| `Deck.Ruleset.TooManyCopies` | above the ruleset copy cap |
| `Deck.Ruleset.BannedCard` | restriction override of `0` and the card is present |
| `Deck.Ruleset.LimitedCard` | above a restriction override that is lower than the cap |
| `Deck.Ruleset.ColorMismatch` | a non-leader card does not share the leader's colour |

Each violation carries structured params (`cardIds`, `expected`, `actual`, `max`, `color`) so the client can
render translated messages rather than server English.

## Server write paths

- `DeckService.ResolveDeckCardsAsync` loads active ruleset definitions plus restrictions, evaluates, and fails
  when nothing is legal. The failure is one `Error.Validation` with code `Deck.Ruleset.NotLegalInAnyRuleset`
  and a description that names each ruleset and its violations, because
  [`ProblemFromErrors`](server/Api/Controllers/ApiControllerBase.cs:8) surfaces only the first error.
- Admin create and update keep their current request bodies. They gain ruleset evaluation and no schema change
  to `Deck`.
- The legacy text import `POST /api/deck` also evaluates. Its existing parse errors and
  `Deck.Create.UnknownCardIds` stay for compatibility; the ruleset evaluation runs after them.
- Reads are unaffected: existing decks that predate the rules remain readable and playable because there is no
  game-start guard in this iteration. They simply cannot be saved until edited into a legal size.
- Development seed decks in `test-data/seed-profiles.json` stay as engine fixtures. They are intentionally not
  legal Standard/Pre-Release decks and are not migrated.

## Ruleset API

New `DeckRulesetController`:

| Method | Route | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/deck-rulesets` | anonymous | active rulesets only, used by both import screens |
| GET | `/api/deck-rulesets/all` | `CardCatalogAdmin` | includes inactive rulesets for the admin screen |
| POST | `/api/deck-rulesets` | `CardCatalogAdmin` | create, returns the stored ruleset |
| PUT | `/api/deck-rulesets/{id}` | `CardCatalogAdmin` | replaces scalars and the restriction list |
| DELETE | `/api/deck-rulesets/{id}` | `CardCatalogAdmin` | allowed; decks do not reference rulesets |

- DTOs in `server/Models/Api/DeckRulesetRequests.cs`: `DeckRulesetResponse`,
  `DeckRulesetCardRestrictionResponse`, `CreateDeckRulesetRequest`, `UpdateDeckRulesetRequest`.
- `DeckRulesetService` resolves restriction card ids to catalogue ids, rejects duplicate ids, and refuses to
  deactivate or delete the last active ruleset with `Deck.Rulesets.LastActive`.
- FluentValidation rules in `server/Api/Validation/DeckRulesetRequestValidators.cs`: key slug, name length,
  `LeaderCount == 1`, `NonLeaderCardCount` 1-200, copy cap 1-99, restriction override 0-99, distinct card ids.

## Client shared rules engine

New shared module, used by both admin and login code, instead of importing admin utilities from the login view:

- `client/src/domain/deck/types.ts` - ruleset, violation and evaluation types.
- `client/src/domain/deck/parseDeckList.ts` - the one text parser. Replaces
  [`deckImport.ts`](client/src/views/admin/utils/deckImport.ts:7) and
  [`validateDeckCardsPayload.ts`](client/src/views/login/utils/validateDeckCardsPayload.ts:6).
- `client/src/domain/deck/evaluateDeckRulesets.ts` - pure mirror of the server policy.
- `client/src/services/api/deckRulesetApi.ts` + `client/src/services/queries/deckRulesetQueries.ts` - ruleset
  reads and admin writes with a `['deck-rulesets']` key root and invalidation after every write.
- `client/src/types/deckRuleset.ts` - wire types.

## Admin deck builder

- [`useDeckAdminModel`](client/src/views/admin/model/useDeckAdminModel.ts:91) loads active rulesets and returns
  `rulesetEvaluations`, `isLegalInAnyRuleset`, `nonLeaderCopies` and `leaderCopies` alongside the existing
  draft state. Save requires a valid name, at least one legal ruleset, and a dirty draft.
- [`deckDraftValidation.ts`](client/src/views/admin/utils/deckDraftValidation.ts:43) keeps normalisation,
  leader/build helpers and the draft signature; rule constants and `evaluateDeckDraft` move to the shared
  evaluator.
- [`DeckAdminValidationList`](client/src/views/admin/components/deck/DeckAdminValidationList.tsx:5) becomes a
  per-ruleset list: one row per ruleset with `data-ruleset-key`, `data-ruleset-legal`, the ruleset name, a
  `Legal` or `Not legal` badge, and its violations carrying the existing `data-violation-code` attributes.
  Name errors stay above the list. A deck with no legal ruleset shows the rejection hint instead of
  `validation.ok`.
- [`DeckAdminEditorPane`](client/src/views/admin/components/deck/DeckAdminEditorPane.tsx:10) shows the leader
  count and a per-ruleset counter such as `Standard 12/50` and `Pre-Release 12/30`, plus the existing totals.
- The catalogue tile copy cap uses the highest cap among active rulesets, so clicking still allows a card that
  only some formats reject; the validation list explains which one.
- [`DeckAdminImportDialog`](client/src/views/admin/components/deck/DeckAdminImportDialog.tsx:9):
  - parses live and fetches metadata for the pasted ids through
    [`fetchCardCatalogByIds`](client/src/services/api/cardCatalogApi.ts:130);
  - shows the parsed non-leader total and one result row per ruleset;
  - `Replace deck` is disabled while the parse is invalid, while metadata is loading, or when no active
    ruleset is legal;
  - on confirm it calls `replaceCards`, which replaces both the card quantities and the leader slot and leaves
    the deck name untouched.
- `DeckAdminView` renames the import handler and toast from merge to replace.

## Login player import

- The import branch in [`LoginView`](client/src/views/login/LoginView.tsx:388) uses the shared parser,
  evaluates against active rulesets with metadata from `fetchCardCatalogByIds`, and renders an inline
  per-ruleset result list under the textarea.
- Submit is blocked with the same message when the text does not parse or no active ruleset is legal, before
  `createUserDeck` is called.
- The server write remains the authority; a rejected save still becomes the existing toast through
  [`getApiErrorMessage`](client/src/views/utils/getApiErrorMessage.ts:1).
- `preloadCardsByIds` continues to warm the cache from the parsed ids.

## Admin ruleset screen

- New route `/admin/rulesets` in [`routes.tsx`](client/src/app/routes.tsx:104), lazy like `/admin/decks`.
- `client/src/views/admin/DeckRulesetAdminView.tsx` with a ruleset rail and an editor pane; link it from the
  deck editor header and the card admin screen.
- Components in `client/src/views/admin/components/ruleset/`: list rail, editor pane, restriction rows, and a
  card picker that reuses [`CardAdminCatalogPane`](client/src/views/admin/components/catalog/CardAdminCatalogPane.tsx:10).
- Model in `client/src/views/admin/model/useDeckRulesetAdminModel.ts`: selected ruleset, editable draft,
  dirty tracking, add/remove restriction, save, create, delete. The same derived-draft pattern as the deck
  builder is used so a refetch never overwrites typing.
- Editor fields: key, name, active toggle, leader count, non-leader card count, copy cap, colour rule, Chakra
  allowance, Summon allowance, sort order, and the restricted card list with a `Max copies` input where `0`
  reads as banned.
- Validation mirrors the server validators; Save is disabled on violations, and the server 400 is surfaced by
  toast.

## i18n

Add `admin.decks.rulesets.*` for the per-format labels, badges, deck-size counters and the no-legal-format
hint; `admin.rulesets.*` for the new admin screen; and `auth.deckValidation.*` for the login results. Reuse
the existing `admin.decks.validation.*` strings where the wording still applies.

## Tests

Server:

- New `DeckRulesetRulesTests.cs`: exact non-leader count, leader counted separately, leader count and copies,
  cap, restriction override of `0` and lower than the cap, colour rule, type allowance, unknown cards, one
  evaluation per ruleset and `IsLegalInAnyRuleset` behaviour.
- New `DeckRulesetRequestValidatorTests.cs` and `DeckRulesetServiceTests.cs`: last-active guard, duplicate
  restriction ids, restriction replacement on update.
- Update [`DeckServiceTests`](server/tests/ProjectHiddenVillage.Server.Tests/DeckServiceTests.cs:11): add a
  ruleset seeding helper and rebuild the create/update fixtures so success cases use a legal deck (leader plus
  the exact non-leader count) and failure cases assert the new rule codes. The legacy text-import tests get
  the same helper.
- Test setup uses the InMemory provider without `EnsureCreated`, so `HasData` does not apply there; tests must
  insert the ruleset rows explicitly.

Client and e2e:

- Expand [`deckAdminMocks.ts`](e2e/helpers/deckAdminMocks.ts:13) with enough non-leader cards at four copies to
  reach 50, mock `GET /api/deck/rulesets`, and make the seeded mock decks legal 50-card decks.
- Update [`admin.deck-builder.spec.ts`](e2e/admin.deck-builder.spec.ts:1): the save-gating test asserts a
  per-ruleset pass/fail state, the import test replaces a draft with a 50-card list, and the Pre-Release row
  shows failure while Standard passes.
- New `e2e/admin.deck-ruleset-editor.spec.ts`: create a ruleset, edit scalars, add a banned card and a limited
  card, deactivate, delete, and the last-active refusal.
- Login import is covered by the shared parser/evaluator unit path plus a feature-level check in the deck
  builder spec, since there is no existing login e2e spec.

Verification: `npm run typecheck`, `npm run lint`, `npm run test:server`, `npm run db:migrate`, and targeted
`npx playwright test e2e/admin.deck-builder.spec.ts e2e/admin.deck-ruleset-editor.spec.ts`. Do not run the
server build or e2e suite while the dev stack is live.

## Risks and follow-ups

- Every existing public deck in the development database becomes unsavable until it reaches 50 or 30
  non-leader cards. That is intended, but the deck rail will still list those decks.
- The e2e mock catalogue is currently six cards; meeting 50 non-leader copies requires additional mock cards.
- `ProblemFromErrors` returns only the first error description, so the server's multi-ruleset failure message
  must be composed deliberately rather than emitted as several errors.
- Follow-ups outside this plan: deck format selection for games, game-start legality guard, format compatibility
  badges on rails and pickers, and a ruleset-aware public-deck filter.

## Implementation notes (as built)

- The migration is `20261025140811_AddDeckRulesets`; both formats are seeded with fixed GUIDs and both are active.
- Restrictions are edited by card id in the ruleset editor rather than through the catalogue pane, which keeps the
  editor to one screen and lets the server resolve ids against the catalogue (unknown ids come back as a 400 toast).
- The admin import dialog confirms only when the parsed list is legal in at least one active format; the editor
  itself still allows an invalid draft to exist so quantities can be adjusted, but Save stays blocked.
- The login import computes the same evaluation over the textarea and blocks submit before `createUserDeck`; the
  server repeats the evaluation on `POST /api/deck`.
- The existing `test-data/seed-profiles.json` decks are intentionally left as engine fixtures: they are not
  Standard or Pre-Release legal, and no game-start guard was added, so they remain playable but unsavable until
  they are rebuilt to 50 or 30 non-leader cards.
- Comment lines are ignored on both sides: a line starting with `//`, or the part of a line after `//`, is dropped
  before parsing. The same rule applies to the admin import dialog and the player import.
- The player import modal now has `Close`, `Use` and `Save`. Every edit of the import textarea is written to
  `localStorage` under `phv-imported-deck`, so a refresh restores the list; `Use` also selects it as the deck for
  the next match. `Save` is only rendered when signed in, writes a named user deck, and falls back to
  `Saved Deck X` where `X` is one above the highest existing `Saved Deck N`.
- The login import reports only a summary: "Deck isn't valid for any format." when every active format
  rejects it, "Deck is valid for format(s): ..." listing the accepting formats otherwise, and no text when
  every active format accepts it.
- Verified: `npm run typecheck`, `npm run lint`, `npm run test:server` (798 passing), `npm run db:migrate`, and
  `npx playwright test e2e/admin.deck-builder.spec.ts e2e/admin.deck-ruleset-editor.spec.ts` (5 passing).
