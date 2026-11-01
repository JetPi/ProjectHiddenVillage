# Set rules stop taking a number

## Goal

A set rule talks about a whole set, so "how many copies" is not something it can answer. The copy field
disappears for set rules; card rules keep theirs. The meaning a set rule carries is decided by the pool mode,
which is the only thing that makes a set-wide statement useful.

## Decisions

1. A set rule is binary. In an **open** pool it bans the set; in an **allow list** it puts the set in the pool at
   whatever the format's copy cap is. That is the only sense either mode can make of "this whole set".
2. The binary meaning is stored in the existing `MaxCopies` column as a sentinel, so evaluation needs no change:
   `0` already means banned, and `int.MaxValue` passes through `min(cap, max)` untouched. A shared constant
   `DeckRulesetCardRule.UnlimitedCopies` names it.
3. The server owns the value. `ResolveRestrictionsAsync` ignores whatever `maxCopies` a set rule request carries
   and writes the mode's value. The client therefore never has to send a number it cannot show.
4. A migration rewrites existing set rules to their format's value, so no row keeps a meaning the UI can no
   longer express. The seeded Pre-Release rules go from `3` to the sentinel, which is behaviour-identical
   because `3` was already the format cap.
5. The row shows what the mode makes of it instead of a number: a "Banned" or "Allowed" chip derived from the
   pool mode, so flipping the mode previews the rewrite before saving.
6. Card rules are untouched: the number stays, `0` bans and `N` limits.

## Server

- `DeckRulesetCardRule` gains `UnlimitedCopies = int.MaxValue` and a helper
   `CopiesFor(CardRestrictionMatchType matchType, CardPoolMode cardPoolMode, int requestedMaxCopies)`, the single
   place the rule is written.
- `DeckRulesetService.ResolveRestrictionsAsync` takes the pool mode and applies that helper; create and update
  both go through it. `ValidateCardPool` keeps testing `MaxCopies > 0`, which the sentinel satisfies.
- `DeckRulesetRequestValidators`: a set rule ignores `MaxCopies` entirely (0-99 still applies to card rules).
- Migration `NormaliseSetRuleCopies`: `UPDATE ... SET "MaxCopies" = CASE WHEN pool mode is AllowList THEN
  2147483647 ELSE 0 END` for every `MatchType = 1` row.

## Client

- [`DeckRulesetEditorPane.tsx`](../client/src/views/admin/components/ruleset/DeckRulesetEditorPane.tsx:449): the
  copy input renders only for `matchType === 'Card'`. A set row shows the mode-derived chip in its place.
- [`useDeckRulesetAdminModel.ts`](../client/src/views/admin/model/useDeckRulesetAdminModel.ts:283): a new set rule
  is added with `maxCopies: 0` (the server decides), the payload sends `0` for set rules, and the draft validation
  skips the copy range for them.
- [`evaluateDeckRulesets.ts`](../client/src/domain/deck/evaluateDeckRulesets.ts:178) needs no change: it already
  reads `0` as banned and caps at the format cap otherwise.

## As implemented

- `DeckRulesetCardRule` carries `UnlimitedCopies` and `CopiesFor`, so the rule's stored copies are decided in one
  place ([`DeckRulesetRules.cs`](../server/Api/Services/Deck/DeckRulesetRules.cs:11)).
- `ResolveRestrictionsAsync` takes the pool mode and applies that helper for every rule it builds.
- Migration `NormaliseSetRuleCopies` moves the four seeded rules to the sentinel and rewrites any other set rule to
  its format's value, so nothing is left carrying a number the editor no longer shows.
- The row swapped the copy input for an "Allowed" / "Banned" chip
  ([`DeckRulesetEditorPane.tsx`](../client/src/views/admin/components/ruleset/DeckRulesetEditorPane.tsx:449)), and
  the client sends `0` for set rules so the server owns the value outright.
- The allow-list "needs an allowing rule" check now counts a set rule as allowing, since in a closed pool that is
  exactly what a set rule means.

## Tests

- `DeckRulesetServiceTests`: a set rule saved in an open format stores `0`; in an allow list it stores the
  sentinel; a card rule keeps the submitted number; the seeded-style allow list still validates decks.
- `DeckRulesetRequestValidatorTests`: a set rule with any `maxCopies` is accepted.
- `e2e/admin.deck-ruleset-editor.spec.ts`: the set row exposes no copy input and shows the chip; the created
  allow-list format's rule carries the sentinel.
