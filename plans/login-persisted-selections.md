# The login panel remembers how you play

Playing several matches with the same setup meant re-picking the same three things every time. The panel now comes
back exactly as it was left: the tab, both formats, the deck source and the chosen deck, the host's time-relaxed
flag, and the display name. Nothing resets on submit, on returning from a match, or on a reload - a value only moves
when the player moves it.

## Where it lives

- `useLoginViewStore` (`client/src/state/loginViewStore.ts`) owns all of it already, so it is persisted rather than
  duplicated: `persist` under `phv-login-selections`, version 1, `partialize` limited to the remembered fields.
- The **join code is deliberately not stored** (`joinCode is one-time per match`), and neither is the validation
  flag: `showDisplayNameError` belongs to one submit.
- The imported deck keeps its own cache (`phv-imported-deck`). It is the one field read back through `merge` instead
  of being persisted twice, so the two copies cannot disagree.
- `merge` is custom for a second reason: a stored object from an older shape must fall back to defaults per member
  instead of arriving with `undefined` in a nested record.

## Rules that are load-bearing

- **A remembered deck is kept only while it still exists.** A deleted saved deck or a withdrawn public deck clears
  the selection (`resolvePersistedDeckSelection`) rather than quietly substituting another one, so the submit's own
  "choose a deck" prompt is what answers it. The `hasLoadedSavedDecks` / `hasLoadedStarterDecks` flags keep a pending
  fetch from wiping a selection it has not had a chance to see.
- **The formats already self-corrected** (`LoginView`'s two fallback effects); the deck pickers now behave the same
  way, through the store setters so the correction is what the next visit restores.
- **A restored deck source must suit the session.** Guests cannot load saved decks, so a persisted `saved_decks` mode
  falls back to public decks once per mount. This only applies to what was restored: picking that mode by hand still
  shows the sign-in hint.
- **The display name persists but yields to an account**: the existing effect writes the authenticated username over
  it, so only guests see their remembered name.

## Verified

- `e2e/login.persisted-selections.spec.ts`: the configuration and name survive a reload; a manual change is what the
  next visit keeps (with the join code asserted empty and absent from the stored object); a bogus remembered deck id
  leaves the picker on its placeholder while the rest of the configuration is untouched.
- Existing `login.deck-import` (the import text still survives its reload) and the four `matchmaking.quickmatch`
  specs re-run green; `tsc -b` and `eslint` clean.

## Open items

- The join code becomes its own question later: it should probably survive a reload while a ticket is in flight, not
  be remembered as a standing selection.
- Persistence is per browser, so two accounts on one machine share the stored deck id. The cleared-on-vanish rule
  above is what keeps that safe; scoping the key per user id is the alternative if it ever matters.
