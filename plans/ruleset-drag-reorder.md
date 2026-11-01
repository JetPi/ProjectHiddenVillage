# Format order by dragging, not by a number

## Goal

The admin rail on `/admin/rulesets` is the only place a format's position matters, so its order should be
produced by dragging the rows instead of typing an integer. `SortOrder` stays in the database as the thing that
orders every list, but the admin stops seeing or typing it, and the drag becomes the only way to change it.

## Decisions

1. `sortOrder` leaves both request records (`CreateDeckRulesetRequest`, `UpdateDeckRulesetRequest`). A new format
   is appended (`max(existing) + 1`), and editing a format never moves it.
2. Reordering is one request, not one request per row: `PUT /api/deck-rulesets/order` carries the whole ordered
   id list, and the server writes `SortOrder = index` for each id in a single `SaveChanges`. That keeps the
   ordering consistent even if a save half-fails, and it is the only writer of the column.
3. A stale client never loses a format: ids the request does not mention keep their relative order after the
   listed ones. Duplicate ids in the request are refused. An id that no longer exists is ignored.
4. The drag mirrors the effect list exactly, because that is the pattern the admin already knows:
   [`CardAdminEffectsSection.tsx`](../client/src/views/admin/components/detailSections/CardAdminEffectsSection.tsx:81)
   uses a `draggable` handle with a generated drag image, `onDragOver` on the row to show a drop ring,
   `onDrop` to commit, and `onDragEnd` to clear. Same states, same visual language.
5. The rail reorders optimistically: the cached list is rewritten the moment the drop happens and the mutation
   runs behind it, so the row does not snap back while the request is in flight. A failure refetches.
6. Order is presentation only, which is why this is safe to do without touching evaluation: no deck legality, no
   matchmaking priority, no game snapshot reads it.

## Server

[`DeckRulesetRequests.cs`](../server/Models/Api/DeckRulesetRequests.cs:66)

- Drop `int SortOrder` from the create and update records.
- Add `ReorderDeckRulesetsRequest(IReadOnlyList<Guid> RulesetIds)`.
- `DeckRulesetResponse` keeps `SortOrder`; nothing emits it into the admin editor any more.

[`DeckRulesetRequestValidators.cs`](../server/Api/Validation/DeckRulesetRequestValidators.cs:75)

- `AddScalarRules` loses its `sortOrderSelector` parameter, and the `sortOrder` rule with it.
- `ReorderDeckRulesetsRequestValidator`: `RulesetIds` not empty, no duplicate ids.

[`DeckRulesetService.cs`](../server/Api/Services/Deck/DeckRulesetService.cs:75)

- `CreateRuleset` computes `SortOrder = await max + 1` instead of reading the request.
- `UpdateRuleset` no longer assigns `SortOrder`.
- New `ReorderRulesets(request)`: load every ruleset id, place the requested ones first in request order, append
  the rest in their current order, write `0..n-1`, save, return the reordered list.

[`DeckRulesetController.cs`](../server/Api/Controllers/DeckRulesetController.cs:47)

| Method | Route | Auth |
| --- | --- | --- |
| PUT | `/api/deck-rulesets/order` | `CardCatalogAdmin`, body `{ rulesetIds: [] }`, returns the reordered list |

No migration: the column, its index and its seed values stay exactly as they are.

## Client

[`DeckRulesetListRail.tsx`](../client/src/views/admin/components/ruleset/DeckRulesetListRail.tsx:15)

- New prop `onReorder: (fromIndex: number, toIndex: number) => void`, plus `draggedIndex`/`dragOverIndex` state.
- Each `<li>` becomes the drop target (`onDragOver` sets the ring, `onDrop` calls `onReorder`, `onDragEnd`
  clears), and the row grows a drag handle with the six-dot glyph, `cursor-grab`, `active:cursor-grabbing`,
  `data-testid="admin-ruleset-drag-handle"` and the translated "drag to reorder" title.
- The row dims while its own handle is held, matching the effect cards.

[`useDeckRulesetAdminModel.ts`](../client/src/views/admin/model/useDeckRulesetAdminModel.ts:243)

- `reorderRulesets(fromIndex, toIndex)` builds the new id order, applies it to the cached `every` list
  synchronously, then fires the mutation.
- The draft loses `sortOrder`; `toDraft`, both payloads and `buildViolations` drop it.

[`deckRulesetApi.ts`](../client/src/services/api/deckRulesetApi.ts:37),
[`deckRulesetQueries.ts`](../client/src/services/queries/deckRulesetQueries.ts:16)

- `reorderDeckRulesets(rulesetIds)` and a mutation that invalidates the ruleset keys on settle, rolling the
  optimistic list back on error.

[`DeckRulesetEditorPane.tsx`](../client/src/views/admin/components/ruleset/DeckRulesetEditorPane.tsx:229)

- The "Sort order" input is deleted. Nothing replaces it; the rail is the control.

[`i18n/en.json`](../client/src/i18n/en.json:869)

- Remove `admin.rulesets.editor.sortOrder` and `admin.rulesets.validation.sortOrder`; add
  `admin.rulesets.rail.dragToReorder` and `admin.rulesets.rail.reorderFailed`.

## Tests

- `DeckRulesetServiceTests`: a created format lands last; `ReorderRulesets` writes `0..n-1` in the requested
  order; unlisted ids are appended; duplicate ids are refused.
- `DeckRulesetRequestValidatorTests`: the reorder body rejects an empty and a duplicated list; the create/update
  records no longer validate a sort order.
- `e2e/helpers/deckAdminMocks.ts`: the ruleset route answers `PUT /api/deck-rulesets/order` by reordering its
  array, so the rail's refetch reflects it.
- `e2e/admin.deck-ruleset-editor.spec.ts`: drag the last row onto the first, assert the request body order and
  the rail order afterwards. `page.dragAndDrop` drives the HTML5 handlers the same way the effect list is driven.

## As implemented

- `PUT /api/deck-rulesets/order` lives on [`DeckRulesetController.cs`](../server/Api/Controllers/DeckRulesetController.cs:65)
  and writes `SortOrder = index` for the whole list in one `SaveChanges`.
- `IDeckRuleset.sortOrder` survives as a read-only field on the client type; `ICreateDeckRulesetRequest` and
  `IUpdateDeckRulesetRequest` omit it, so it can never be sent back.
- The optimistic order lives in the mutation's `onMutate`, not in the model, so the rail's cached list is the
  single source the rows render from.
- A drop fires the request and shows the "Format order saved." toast; a failure rolls the list back and shows the
  rail's reorder-failed message in its place.

## Verification

`dotnet build` + `npm run test:server`, client `typecheck`/`lint`/`build`, and the ruleset-editor, deck-builder,
deck-import, quick-match and share-link Playwright specs.
