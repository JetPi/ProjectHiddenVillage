# First admin without touching the database

## What changed

- `server/Data/Seeding/Bootstrap/AdminBootstrapSeeder.cs` (+ `AdminBootstrapOptions`): promotes an existing
  `users` row to `IsCardCatalogAdmin`, or creates the account when `AdminBootstrap:Password` is configured.
  It never rewrites the password of an existing row and skips guest identities.
- `server/Program.cs`: seeder runs once at startup in the same scope as the reference catalogue, gated on
  `AdminBootstrap:Enabled` (default off, any environment).
- `docker-compose.yml` / `.env.example`: `ADMIN_BOOTSTRAP_ENABLED|EMAIL|USERNAME|PASSWORD` pass-through.
- `server/tests/.../AdminBootstrapSeederTests.cs`: promote (password untouched), already-admin no-op, create,
  derived username, no-password no-op, guest refusal, blank email.

## Why not SQL over a published port

Publishing 5432 is a permanent hole for a one-shot operation; the seeding seam already exists and stays
closed by default.

## How to run it

1. Deploy an image containing this change.
2. In the compose directory `.env`: `ADMIN_BOOTSTRAP_ENABLED=true`, `ADMIN_BOOTSTRAP_EMAIL=<account>`,
   leave `ADMIN_BOOTSTRAP_PASSWORD` empty when the account already exists.
3. `docker compose up -d api`, then check `docker compose logs --since 5m api | grep -i "admin bootstrap"`.
4. Set `ADMIN_BOOTSTRAP_ENABLED=false` and `docker compose up -d api` again.
5. Sign out and back in: the claim is minted at login, and existing tokens keep their old claims.

## Verified

`dotnet test --filter AdminBootstrapSeederTests` -> 7 passed.
