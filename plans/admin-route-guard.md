# Admin routes are gated, not just decorated

## What was wrong

`https://game.shinobitactics.dev/admin/cards` opened with no session at all. Nothing had been broken; the guard was
never built.

- `client/src/app/routes.tsx` listed `/admin/cards`, `/admin/cards/new`, `/admin/decks`, `/admin/decks/:deckId` and
  `/admin/rulesets` as flat `lazy` component routes. No `loader`, no parent route, no session read anywhere in the
  tree.
- `client/nginx.conf` serves the SPA shell for every path, so typing the URL boots the app and React Router happily
  mounts `CardAdminView`.
- The catalogue and set-code reads those screens use are anonymous (the game needs them), so the page not only
  opened, it filled with data. Only writes answered 401.
- The client had no admin signal to gate on: `IAuthSession` carried `isGuest` but nothing else, and
  `LoginResponse` dropped `IsCardCatalogAdmin` even though `UserResponse` had it.

Two things hid this during local runs:

1. `DevelopmentAuthenticationHandler` authenticates *every* request as the seeded admin with the
   `card_catalog_admin` claim, so anonymous dev/e2e browsing could exercise admin writes. Production expects a
   token; the route shell rendered anyway.
2. Guest play mints a session into the same store, so a browser was rarely session-less even while playing
   anonymously.

Server-side write policies (`CardController`, `CardArtController`, `DeckRulesetController`, `MaintenanceController`,
`POST /api/deck/public`) were already correct and are unchanged.

## What changed

### Server

- `LoginResponse` gained `IsCardCatalogAdmin`. `UserController.Login` fills it from the user row;
  `GuestUserService.CreateGuestSessionAsync` always reports `false`.
- `GET /api/user/me`, `[Authorize]`: resolves the caller from the token (`NameIdentifier`, falling back to `sub`) and
  returns their own `UserResponse`. This is the answer the guard trusts.
- `GET /api/user/{userId}` and `GET /api/user` are now `[Authorize]`. They return email plus the admin flag, which is
  the exact pair an anonymous visitor would need to list admins - publishing it would have made hiding the screens
  pointless. Neither has a client consumer.

### Client

- `IAuthSession.isCardCatalogAdmin` (default `false` in `parseAuthSession`, so pre-existing stored sessions and guest
  sessions are safe reads). Set from the login response in `loginRouteHandlers`, `signInRouteHandlers` and the guest
  API mapping.
- `client/src/app/guards/adminRouteGuard.ts`:
  - no session / expired session -> mark the sign-in notice, then `redirect('/')`;
  - session present -> `GET /api/user/me`; `401`/`404` clears the session and redirects as above;
  - verified non-admin -> `throw new Response(null, { status: 404 })`;
  - transport failure -> `503`, never "allowed";
  - verified admin -> `null`.
- `client/src/app/guards/adminGuardNotice.ts` + `RouteTransitionOverlay`: the notice is left as a module flag and
  turned into a toast by the shell after the redirect commits. A toast raised inside the loader itself never reached
  the screen - it is created while the redirect is still in flight - which the first version of this work did wrong
  and the e2e test caught.
- `client/src/app/routes.tsx`: the five admin routes are now children of one `/admin` parent whose `loader` is the
  guard, with an `index` redirect to `/admin/cards`. Child paths are relative, so a route added under `/admin`
  inherits the gate instead of reopening the hole.
- `client/src/components/feedback/AdminRouteErrorBoundary.tsx` renders the existing `NotFoundView` for the guard's
  404 and the standard `RouteErrorBoundary` for everything else - so a non-admin sees a page that does not exist,
  while a genuine outage is still visible.
- `client/src/services/api/userApi.ts` is the single client call to `/api/user/me`.

The stored flag is never the deciding vote. It is written by the server, but it lives in localStorage, so the guard
re-asks; a hand-edited `isCardCatalogAdmin: true` renders nothing (covered by an e2e test).

## Corrections this deliberately does not make

- The `/admin` chunk can still be *fetched* by a denied visitor: React Router resolves matched lazy modules in
  parallel with loaders. Nothing renders and no data is exposed, so this is accepted rather than worked around with a
  custom pre-match hook.
- Real per-page enforcement stays on the server. The guard hides screens; `[Authorize(Policy =
  AuthorizationPolicies.CardCatalogAdmin)]` is what actually refuses work.

## Tests

- `server/tests/.../UserControllerCurrentUserTests.cs`: login reports the flag for an admin and not for a regular
  account; `/me` resolves from `NameIdentifier` and from `sub`; a principal with no id is 401.
- `GuestUserServiceTests`: the guest session response reports `IsCardCatalogAdmin == false`.
- `e2e/admin.route-guard.spec.ts`: walks all five admin URLs for anonymous, guest, non-admin, tampered-flag and admin
  sessions; the anonymous case also asserts the sign-in notice, and the admin case proves the screens still render.
- The existing admin specs needed no behavioural change: their sessions come from a real admin login, and
  `createAdminSession` now carries the flag.

## Operational note

Existing browser sessions persist without the flag until the next login; the guard re-verifies server-side, so an
admin is never locked out by a stale stored session.
