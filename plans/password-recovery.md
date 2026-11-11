# Password recovery

## Problem

Registration exists ([`signInAction`](client/src/views/login/handlers/signInRouteHandlers.ts:21) posts `/api/user`), but
there is no way back into an account whose password is forgotten. Today the only recovery path is
[`AdminBootstrap`](server/Data/Seeding/Bootstrap/AdminBootstrapSeeder.cs:16) — and by design it never rewrites the
password of an existing row, so it cannot recover anyone.

What exists to build on:

- Passwords are already standard ASP.NET Core hashes: `IPasswordHasher<User>` is registered at
  [`Program.cs:210`](server/Program.cs:210) and used at [`UserService.VerifyLogin()`](server/Api/Services/User/UserService.cs:55).
- `users.Email` is unique ([`UserConfiguration`](server/Data/Configurations/Users/UserConfiguration.cs:38)), so an email
  identifies exactly one account.
- Sessions are **stateless JWTs** valid for 12 hours (`Jwt:AccessTokenLifetimeMinutes` in
  [`appsettings.json`](server/appsettings.json:19)) and held in `localStorage` under `phv-auth-session`
  ([`authSession.ts`](client/src/state/authSession.ts:4)). There is no logout endpoint and no server-side session
  store, so "sessions" cannot be revoked by deleting a row.
- There is **no email capability at all** — no SMTP client, no provider SDK, no sender abstraction.

## The options, and the pick

| Approach | What it is | Verdict |
| --- | --- | --- |
| Emailed single-use link | User submits email, gets a link with an opaque token, opens it, picks a new password | **Chosen.** Universal, no extra install, works on any device, one email per reset |
| Emailed 6-digit OTP | Same, but the user types a code | Rejected: needs attempt-counting per code, and typing a code is no easier than clicking a link |
| Magic-link sign-in | Passwordless login by email link | Rejected: a different product decision, not recovery, and it removes the password the account already has |
| Security questions | Answer a stored question | Rejected: weak answers, extra PII, poor UX |
| Admin/CLI reset | Operator sets a temp password | Keep only as a break-glass fallback; it cannot scale to real users and needs the same out-of-band channel anyway |

A parenthetical that matters: **Hetzner blocks outbound port 25**, so sending mail directly from the API is not an
option. Either a relay on 587 or an HTTPS email API is required. That, plus deliverability, decides the sender
design below.

## Decisions

1. **Email is sent through an `IEmailSender` abstraction**, with a `Resend` implementation (HTTPS API) and a `Null`
   implementation for Development and tests. The provider choice then becomes configuration, not code.
   - Transactional API over SMTP because of the blocked port 25 and because DKIM/SPF are managed by the provider.
   - `Resend` free tier (~3k/month) is plenty for a game of this size; Postmark/Brevo are drop-in alternatives.
   - An SMTP relay remains a possible third implementation, but it would add a MailKit dependency; the seam is what
     keeps that a later, isolated change instead of a rewrite.
2. **The token is 32 random bytes, Base64Url-encoded (~43 chars), and only its SHA-256 hash is stored.** A database
   leak must not hand out working reset links — same reasoning as never storing plaintext passwords.
3. **One live token per account.** Requesting a new link retires the previous unconsumed token(s) by stamping
   `ConsumedAtUtc`, so a forwarded old email is dead the moment a newer one is requested. Rows are kept for a day
   rather than deleted on sight, because the per-account hourly cap is measured by counting them.
4. **60-minute expiry, single use.** `ConsumedAtUtc` is set on use and checked atomically with the password write.
5. **The request endpoint always answers `202 Accepted`**, whether or not the address exists, and guest rows are
   silently skipped. `@guests.invalid` identities ([`GuestUserService`](server/Api/Services/Guests/GuestUserService.cs:83))
   must never receive mail and can never be signed into anyway, so they are not recoverable.
6. **A successful reset signs the user in on that device** by returning the same `LoginResponse` the login endpoint
   returns ([`UserController.Login()`](server/Api/Controllers/UserController.cs:62)). Reusing `IAuthTokenService`
   avoids a "password changed, now log in again" step and gives the client the new token directly. No follow-up
   confirmation email and no interstitial: the confirm response *is* the session.
7. **Recovery only.** The link exists to get back into a forgotten account. There is no signed-in change-password
   screen, no reuse of the token for a settings flow, and therefore no extra route guard or session-aware variant of
   the confirm endpoint. A signed-in user who wants a new password uses the same forgot-password flow.
8. **A reset invalidates older sessions.** Because JWTs are stateless, the user row gains an `AuthVersion` integer
   that is embedded in the token as `ver` and re-checked on every authenticated request. This is the one part of the
   feature that touches the existing auth pipeline, and it is a real security requirement: "I changed my password to
   kick the person who has my old login out" has to actually kick them out. It ships with this feature, as its own
   stage, not as a later hardening pass.

## Design

### 1. Schema

New entity [`PasswordResetToken`](server/Data/Entities/Users/PasswordResetToken.cs) (table `password_reset_tokens`):

- `Id` (Guid, PK)
- `UserId` (Guid, FK → `users.Id`, cascade delete — the guest sweeper deletes rows and must not orphan tokens)
- `TokenHash` (string(64), unique index)
- `CreatedAtUtc`, `ExpiresAtUtc`, `ConsumedAtUtc` (nullable)
- `RequestedFromIp` (nullable, string(64) — for abuse investigation only)

New column on `User`: `AuthVersion` (int, default 0), plus `PasswordChangedAtUtc` (nullable, for operator support and
audit). One EF migration, following the existing naming (`AddPasswordResetTokens`).

Spent, expired and superseded rows are purged opportunistically for the affected user on each request, once they are
older than `PasswordReset:TokenRetentionHours` (default 24). No hosted sweeper is needed: the table holds at most a few
rows per account, and the retention window is exactly what makes the hourly cap measurable.

### 2. Service

[`IPasswordResetService`](server/Api/Interfaces/Auth/IPasswordResetService.cs) with two operations, implemented in
[`PasswordResetService`](server/Api/Services/Auth/PasswordResetService.cs) using `ErrorOr` like the rest of the
service layer ([`UserService`](server/Api/Services/User/UserService.cs:11)):

- `RequestAsync(email, requestedFromIp)` → always success. Normalises the email the same way
  [`UserService.CreateUser()`](server/Api/Services/User/UserService.cs:22) does, looks it up, skips guests, enforces
  the cooldown/cap, mints a token, stores the hash, sends the mail.
- `ConfirmAsync(token, newPassword)` → on success: validate token, hash the new password with the registered
  `IPasswordHasher<User>`, increment `AuthVersion`, stamp `PasswordChangedAtUtc`, consume the token, delete siblings,
  return the user id so the controller can mint a fresh token pair.

Token comparison is a lookup by hash (indexed), not a scan; the raw token therefore never exists server-side after
the mail is handed to the sender.

### 3. Endpoints

Both live on [`UserController`](server/Api/Controllers/UserController.cs:13), anonymous, alongside `login` and `guest`:

- `POST /api/user/password-reset/request` — body `{ email }` → `202`, no body. Same response for unknown address,
  guest address, throttled-and-still-accepted, and mail actually sent. Validation only rejects a malformed email.
- `POST /api/user/password-reset/confirm` — body `{ token, newPassword }` → `200 LoginResponse`, or a single generic
  `400` (`Auth.PasswordReset.InvalidToken`) for expired/used/unknown tokens. Never distinguishes them.

DTOs go in [`server/Data/DTOs/User.cs`](server/Data/DTOs/User.cs:8); FluentValidation rules go next to the existing
user validators in [`GameRequestValidators.cs`](server/Api/Validation/GameRequestValidators.cs:137).

Password rule: minimum 10 characters, maximum 128, on **both** confirm and sign-up. Today sign-up only checks
`NotEmpty`, which would let a reset set a weaker password than the policy claims.

### 4. Email

New [`IEmailSender`](server/Api/Services/Email/IEmailSender.cs) with `SendPasswordResetAsync(email, resetUrl, username)`.
Options bound from configuration (`EmailOptions`, section `Email`):

```jsonc
"Email": {
  "Provider": "None",                                  // None | Resend | Smtp
  "FromAddress": "no-reply@mail.shinobitactics.dev",
  "FromName": "Shinobi Tactics",
  "AppPublicBaseUrl": "http://localhost:5173",          // https://game.shinobitactics.dev in production
  "Resend": { "ApiKey": "" },
  "Smtp": { "Host": "", "Port": 587, "Username": "", "Password": "" }
}
```

- The link is `${AppPublicBaseUrl}/reset-password?token=<token>`.
- The body is short text plus a one-button HTML part; no images, no tracking pixels. Includes "if you did not ask for
  this, ignore this mail" and the expiry.
- Startup logs a warning when `Provider != None` but the matching secret is empty, so a misconfiguration is visible in
  `docker compose logs` instead of silently swallowing resets.
- `AppPublicBaseUrl` is separate from the CORS origin on purpose: the API must not guess the browser origin from a
  request header.

Deliverability setup (one-time, Cloudflare DNS, same zone as the game host):

1. Verify `mail.shinobitactics.dev` as a sending domain at the provider.
2. Add the provider's SPF and DKIM records; keep the apex SPF untouched.
3. Add DMARC (`v=DMARC1; p=none; rua=...`) and tighten to `quarantine` once aligned mail is confirmed.

Production env additions in [`docker-compose.yml`](docker-compose.yml:46) and
[`.env.example`](.env.example:19): `EMAIL_PROVIDER`, `EMAIL_RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`,
`APP_PUBLIC_BASE_URL`.

### 5. Session invalidation

- [`AuthTokenService`](server/Api/Services/Auth/AuthTokenService.cs:25) adds a `ver` claim with the user's
  `AuthVersion`.
- [`Program.cs`](server/Program.cs:282) adds `JwtBearerEvents.OnTokenValidated`: for registered tokens, compare `ver`
  with the row. Mismatch → fail authentication (the existing `OnChallenge` already turns that into the JSON `401`).
- To avoid a database read per authenticated request on a 1 vCPU box, the version is cached per user id for ~60
  seconds (`IMemoryCache`). Worst case a revoked token keeps working for a minute; the alternative — a query on every
  request — costs far more than that window is worth. Guest tokens carry no `ver` and skip the check entirely, since
  guests cannot be reset.

This is the only piece that reaches outside the recovery feature, and it is not optional: without it a stolen token
keeps working for up to 12 h after the owner resets. It stays its own stage purely so it can be reviewed and tested
separately from the REST surface, not so it can be dropped.

### 6. Client

Data-mode routes, matching how the two existing auth screens are wired in
[`routes.tsx`](client/src/app/routes.tsx:53) — lazy module + `loader`/`action`, `AuthRouteErrorBoundary`:

- `/forgot-password` → `ForgotPasswordView` + `forgotPasswordRouteHandlers.ts`.
  Action posts to the request endpoint and **always** renders a neutral "If an account exists for that address, a
  reset link is on its way." Renders the same panel when the address is unknown, so the screen is not an enumeration
  oracle.
- `/reset-password` → `ResetPasswordView` + `resetPasswordRouteHandlers.ts`.
  Reads `token` from the URL, requires `password` + `confirmPassword`, posts to confirm, then `persistAuthSession` and
  redirects to `/` with an auth notice. Invalid/expired token renders a "request a new link" state instead of an
  error toast.

Both views use `PageShell scrollable`, already used by [`SignInView`](client/src/views/login/SignInView.tsx:23), and the
same `Form`/`FormField` primitives, so mobile behaviour is inherited rather than re-solved.

Entry points:

- "Forgot password?" link inside the login modal in [`LoginView`](client/src/views/login/LoginView.tsx:1690), under the
  password field.
- "Already have an account?" / "Forgot password?" cross-links on [`SignInView`](client/src/views/login/SignInView.tsx:77).

Token-in-URL handling: `/reset-password` sends no outbound navigation in its initial state, and
[`client/index.html`](client/index.html) gains `<meta name="referrer" content="no-referrer">` so a later click cannot
leak the token through `Referer`. The confirm endpoint responds with `Cache-Control: no-store`. Because the confirm
response is also the sign-in response, the page never renders a "now log in" state — it hands the session straight to
the login view.

Strings go in [`en.json`](client/src/i18n/en.json) under `auth.forgotPassword.*`, `auth.resetPassword.*`,
`auth.errors.*`; no hardcoded English in the views, consistent with the rest of the app.

### 7. Abuse resistance

No rate limiting exists anywhere in the API today (no `AddRateLimiter` in [Program.cs](server/Program.cs)). Add a
named limiter for these two routes only:

- Request: fixed window per client IP, 10/hour; plus a per-email cooldown of 60 s and a cap of 5/hour enforced in the
  service. Throttled requests still answer `202`; the IP limiter answers `429` with `Retry-After`.
- Confirm: 20/hour per IP. The token space is 256 bits, so brute force is not a realistic threat; the limit is there
  to stop a loop from being used as a free CPU burner (hash verification is deliberately expensive).

Optional, out of scope but worth noting: [`UserService.VerifyLogin()`](server/Api/Services/User/UserService.cs:61)
currently answers `404 Auth.UserNotFound` for an unknown email, which lets anyone probe registration. The reset flow
deliberately does not repeat that pattern.

## Stages

1. **Service + schema, no mail.** Entity, migration, `IPasswordResetService`, `NullEmailSender`, two endpoints
   returning `202`/`200`. Unit tests with an in-memory `ApplicationDbContext`.
2. **Real sender.** `ResendEmailSender`, `EmailOptions`, config wiring, `RecordingEmailSender` for tests, startup
   warning, DNS records.
3. **Client.** Both routes, both views, handlers, i18n, entry links.
4. **Session invalidation.** `AuthVersion`, `ver` claim, `OnTokenValidated`, memory cache. Deliberately last, because
   it changes the auth pipeline for every request and deserves its own test pass (login, guests, admin guard, hub
   auth). In scope for this feature: the confirm response already mints a token, so the version it carries has to be
   the one the pipeline checks.
5. **Hardening.** Rate limiter, password policy on sign-up and reset, `no-store`, referrer meta, cleanup pass.

## Tests

Unit (`server/tests/ProjectHiddenVillage.Server.Tests/`):

- `PasswordResetServiceTests`: unknown email still reports success and sends nothing; guest email sends nothing;
  stored value is not the raw token; expiry boundary; second use fails; a new request kills the old token; confirm
  bumps `AuthVersion` and the old hash fails `VerifyHashedPassword`; siblings deleted; cooldown/cap enforced.
- `EmailSenderTests` (or a fake `HttpMessageHandler`): request shape, `from`, absolute link contains the base URL, no
  token in logs.
- `UserControllerPasswordResetTests`: `202` in every branch, `400` shape for invalid tokens, `200 LoginResponse` with
  a usable token on success.

E2E (`e2e/auth.password-reset.spec.ts`): with the provider set to the recording sender and the token surfaced through
a test-only endpoint gated the same way as [`TestEndpointGate`](server/Api/Testing/TestEndpointGate.cs) — request a
reset, read the token, set a new password, assert redirect to `/` signed in, assert old password now fails, assert new
password logs in.

## Config summary

| Key | Default | Notes |
| --- | --- | --- |
| `PasswordReset:Enabled` | `true` | Off disables both endpoints with `404`, for environments with no mail |
| `PasswordReset:TokenLifetimeMinutes` | `60` | |
| `PasswordReset:RequestCooldownSeconds` | `60` | Per email |
| `PasswordReset:MaxRequestsPerHourPerEmail` | `5` | Per email |
| `PasswordReset:TokenRetentionHours` | `24` | How long a spent row is kept for cap accounting |
| `Email:Provider` | `None` | `Resend` in production |
| `Email:AppPublicBaseUrl` | `http://localhost:5173` | `https://game.shinobitactics.dev` in production |
| `Email:FromAddress` | `no-reply@mail.shinobitactics.dev` | Must match the verified sending domain |

## Implementation status

Shipped in code:

- Schema: `password_reset_tokens`, `users.AuthVersion`, `users.PasswordChangedAtUtc`, migration
  `20261109135702_AddPasswordResetTokens`.
- [`PasswordResetService`](server/Api/Services/Auth/PasswordResetService.cs:30) with hashed single-use tokens, the
  cooldown and hourly cap, guest skipping, sibling retirement and opportunistic purge.
- [`IEmailSender`](server/Api/Services/Email/IEmailSender.cs:9) with `Resend`, `Null` and a test-only `Recording`
  sender; `EmailOptions`/`PasswordResetOptions` bound in [`Program.cs`](server/Program.cs:211) with the startup
  misconfiguration warning.
- Both endpoints on [`UserController`](server/Api/Controllers/UserController.cs:100), `202`/neutral on request,
  `LoginResponse` with `no-store` on confirm, behind `[EnableRateLimiting]`.
- `ver` claim in [`AuthTokenService`](server/Api/Services/Auth/AuthTokenService.cs:18) and the check via
  [`AuthVersionValidator`](server/Api/Services/Auth/AuthVersionValidator.cs:14) attached once to the JWT pipeline;
  the cache entry is evicted by the reset itself.
- Validators and the shared 10-128 password policy in [`UserPasswordPolicy`](server/Api/Validation/UserPasswordPolicy.cs:10),
  applied to sign-up and confirm but deliberately not to login.
- Forwarded-header handling so the per-caller rate limits and logs see the real address behind Caddy.
- Client: `/forgot-password` and `/reset-password` routes, both views and handlers, entry links in the login modal and
  the sign-up page, the `passwordReset` auth notice, `no-referrer` on the document.
- Tests: 27 new unit tests (service, controller, sender, validator, token claim) and
  [`e2e/auth.password-reset.spec.ts`](e2e/auth.password-reset.spec.ts:1) with three scenarios.

Verification: `dotnet build` clean, `dotnet test` 1078 passed, `npx playwright test e2e/auth.password-reset.spec.ts`
3 passed, `npm run typecheck` clean.

## Resend setup (done)

- Domain **`mail.shinobitactics.dev`**, id `d6923fbc-3cdc-4dc3-b50c-3d93d7c80f32`, region `eu-west-1` (Nuremberg is
  the closest box), sending on, receiving off. Status **verified**.
- Records live in Cloudflare, all DNS-only: `resend._domainkey.mail` TXT (DKIM), `send.mail` MX 10
  `feedback-smtp.eu-west-1.amazonses.com`, `send.mail` TXT SPF, `rsend.mail` CNAME `send.forge.rmta.net`, plus
  `_dmarc.mail` TXT `v=DMARC1; p=none; rua=…` added by hand.
  Domain Connect was not offered in the Resend UI for this zone, so the records were added manually; the one-click
  path is only available to accounts where Resend shows a **Sign in to Cloudflare** button.
- Key: name `PHV production password reset`, id `9d1630fe-b1db-4986-9ed8-d1ec110ea23b`, **sending access only,
  restricted to the domain**. The token exists in `/opt/phv/.env` as `EMAIL_RESEND_API_KEY`; the local copy used to
  transfer it was deleted, and the value never appeared in a shell argument or this repository.
- `/opt/phv/.env` now also carries `EMAIL_PROVIDER=Resend`, `EMAIL_FROM_NAME=Shinobi Tactics`,
  `EMAIL_FROM_ADDRESS=no-reply@mail.shinobitactics.dev`, `PASSWORD_RESET_ENABLED=true`. A timestamped `.env` backup
  sits beside it.
- Delivery proven with a live send: Resend id `01a1cc4e-f61e-708c-8bcc-1e8f31df39ea`, `last_event: delivered`,
  from `Shinobi Tactics <no-reply@mail.shinobitactics.dev>`.

Not applied yet: the running API still has `Provider=None` until the container is recreated, which only happens on
the next deploy. The image also has to be built from `main` (publish-images does not run for feature branches), so the
sequence is: commit, merge to `main`, wait for `Publish images`, then run the `Deploy` workflow.

One deliberate rollout cost: tokens minted before this change carry no `ver` claim and are refused, so every current
session needs one login. That is the price of not letting a stolen pre-reset token survive its full 12-hour life.

## Settled

- **Recovery only.** No change-password screen, and no reuse of the confirm endpoint behind `[Authorize]`. A signed-in
  user who wants a new password goes through the same forgot-password flow.
- **Auto-login on confirm.** `POST /api/user/password-reset/confirm` returns `LoginResponse`; the client persists it,
  lands on `/` signed in, and raises an auth notice that the password was updated.
- **`AuthVersion` ships with this feature**, validated on every registered token and cached per user for ~60 s. If the
  cache proves to be the wrong trade on the small box, the fallback is a longer cache window, never removing the
  check.
