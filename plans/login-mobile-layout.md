# Login view mobile layout

## Decision: one responsive tree, extracted into composable panels

No mobile copy of the view. The defects are scroll and layout, not structure, and
[`LoginView()`](client/src/views/login/LoginView.tsx:169) owns the whole login contract — identity, deck
ruleset evaluation, matchmaking tickets, rematch reservations, the share/import/delete dialogs — so a
mobile duplicate would still be fed by that controller and would double the markup and e2e surface for
every future deck or ruleset feature.

The requested middle ground is taken instead: split the form's three blocks into presentational panels
that `LoginView` composes. Extraction lands **before** the responsive work, so the mobile diff is three
small files rather than a 2,235-line one, and a genuinely different mobile flow later (wizard, accordion)
can compose the same panels without touching state.

Rejected: JS media query or UA sniffing. The single precedent,
[`useHasRoomForChatColumn()`](client/src/views/game/hooks/GameView/useHasRoomForChatColumn.ts:24), exists
because the chat panel is a behavioural decision, not a style one.

## Defects at 320-430px wide

1. No scrolling at all: [`PageShell`](client/src/components/layout/PageShell.tsx:25) is
   `h-dvh overflow-hidden`, so Quick Match, Host and the Discord invite are clipped off-screen with no
   way to reach them.
2. Hard two-column form at every width: [`LoginView.tsx:1603`](client/src/views/login/LoginView.tsx:1603)
   with `col-span-1` children at `:1657` and `:1745`.
3. Nested two-column split inside the left column for Join/Host at
   [`LoginView.tsx:1689`](client/src/views/login/LoginView.tsx:1689) → ~65px controls.
4. Fixed 60px title at [`LoginView.tsx:1582`](client/src/views/login/LoginView.tsx:1582).
5. Dropdown listbox is absolutely positioned and clipped in narrow columns:
   [`FormSelect.tsx:96`](client/src/components/forms/FormSelect.tsx:96).
6. iOS focus zoom: 14px controls at [`FormInput.tsx:14`](client/src/components/forms/FormInput.tsx:14)
   and [`FormSelect.tsx:69`](client/src/components/forms/FormSelect.tsx:69).
7. Tap targets under 44px: theme toggle [`LoginView.tsx:1622`](client/src/views/login/LoginView.tsx:1622),
   session button strip [`LoginView.tsx:1649`](client/src/views/login/LoginView.tsx:1649), retry hint
   [`LoginView.tsx:1760`](client/src/views/login/LoginView.tsx:1760).
8. Cramped rows: online count plus theme button beside the Display Name label
   ([`LoginView.tsx:1606`](client/src/views/login/LoginView.tsx:1606)); the deck summary pill squeezes
   the name to nothing ([`LoginView.tsx:1811`](client/src/views/login/LoginView.tsx:1811)).
9. Vertically centred fixed dialogs cannot scroll with the keyboard open: login
   [`LoginView.tsx:1847`](client/src/views/login/LoginView.tsx:1847), logout `:1923`, matchmaking
   [`MatchmakingSearchDialog.tsx:66`](client/src/views/login/components/MatchmakingSearchDialog.tsx:66).
   [`DeckImportDialog.tsx:124`](client/src/views/login/components/DeckImportDialog.tsx:124) already
   scrolls and is the pattern to copy.

## Stage 1 — scrollable shell

`PageShell` gains an explicit `scrollable` prop (default off, so admin and game views keep their fixed
viewport); LoginView, SignInView, NotFoundView and AuthRouteErrorBoundary opt in. Pure shell change,
verifiable with the existing suite before any markup moves.

## Stage 2 — panel extraction (no visual change)

New files under `client/src/views/login/components/panels/` plus prop types in
`client/src/views/login/types/panels.ts`:

- `LoginDisplayNameField` — Display Name input, online count, theme toggle, login/logout strip, error
  text. Props: value, change handler, show error, online count, toggle theme, is authenticated, open
  session dialog. The controller decides which dialog the strip opens.
- `LoginGameEntryPanel` — mode toggle, quick-match format select plus Find Match, join code plus Join,
  host format select plus Host, time-relaxed switch. Props: mode and its options, the two ruleset ids
  and configs, join code and config, relaxed flag, `isBusy` and `isMaintenance` for the disabled states,
  `hasQuickmatchRulesets`, `className`.
- `LoginDeckPanel` — deck mode toggle, retry hint, guest hint, import button or deck select, summary
  line. Props: mode and its options, selected value and change handler, field config, starter-fetch
  failed and retry, show guest hint, open import dialog, summary name and evaluation, checking flag,
  record, `className`.

Boundary rules that keep this safe:

- All state, effects, handlers and toasts stay in `LoginView`. Panels are presentational, hold no state,
  and take no `isMobile` prop; placement is `className` only.
- Panels render inside the existing `<Form>`, so `AppButton type="submit" name="intent"` keeps working
  and `page.locator('form').getByTestId('login-deck-summary')` keeps resolving.
- The panel root becomes the grid item, so `col-span-*` and the `min-w-0` that stops a select from
  blowing the column out move to the panel root; inner `FormField`s become plain blocks.
- Every `data-testid` (`online-players`, `login-deck-summary`, `login-deck-summary-pill`,
  `login-deck-record`, `host-time-relaxed`, `login-deck-invalid-value`) stays exactly as-is.
- The summary row keeps three sibling spans in the same order (pill, name, record): both
  [`create-game.share-link.spec.ts:394`](e2e/create-game.share-link.spec.ts:394) and
  [`matchmaking.quickmatch.spec.ts:242`](e2e/matchmaking.quickmatch.spec.ts:242) assert on
  `span.last()`.

## Stage 3 — responsive layout inside the panels

- Form grid `grid-cols-2` → `grid-cols-1 lg:grid-cols-2`; the Display Name row keeps `col-span-2`.
- Join/Host pair stays side by side and stacks below ~380px.
- Title `text-4xl sm:text-6xl lg:text-7xl`.
- Tap targets on the two icon buttons and the retry hint reach 44px on mobile, desktop density kept.
- Display Name header and deck summary become wrapping rows instead of truncating to nothing.

## Stage 4 — control-level and dialog fixes

- `text-base sm:text-sm` on FormInput, FormSelect, FormTextarea (global; also fixes the sign-in and admin
  forms, which have the same 14px zoom trigger).
- Login, logout and matchmaking dialogs get a scrolling overlay with `max-h` and an internally
  scrolling body, mirroring DeckImportDialog.

## Stage 5 — guardrail

`e2e/login.mobile-layout.spec.ts` at 390x844: no horizontal overflow
(`scrollWidth <= clientWidth + 1`), Display Name, format, deck picker and both action buttons reachable
by scrolling, control text at least 16px, primary controls at least 44px tall. Update any existing spec
whose structural assumptions moved.

## Verification

Done in this pass: `npm run build` and `npm run lint` clean; `npx playwright test login. matchmaking.
create-game. auth.` green (29 tests), including the new `e2e/login.mobile-layout.spec.ts` (390x844 and
320x568: no sideways scroll, Join/Host/Find Match and the Discord invite reachable, 16px control text);
`npx playwright test admin.route-guard.` green after the app-routes change.

The build also stopped warning about `NotFoundView` being both lazy and statically imported: the admin
404 boundary already pulls it into the eager graph, so the wildcard route now imports it statically.
Manual inspection still owed at 430px and on a real iOS device.

## Out of scope

Board and game view mobile work, admin views, keyboard-driven board layout, hover-only affordances,
orientation handling.
