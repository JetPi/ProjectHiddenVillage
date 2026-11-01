# Deploy button + maintenance flag

## What landed

| Where | What |
| --- | --- |
| `server/Api/Services/Maintenance/MaintenanceState.cs` | In-process flag seeded from `Maintenance:Enabled`; `Enable(message)` / `Disable()`; a restart ends it |
| `server/Api/Services/Maintenance/MaintenanceReporter.cs` | `MaintenanceSnapshot` (enabled, message, since, activeGames, waitingPlayers, isDrained) off the registry and the queue |
| `server/Api/Services/Maintenance/MaintenanceGate.cs` | `BlockedError(state)` -> `Error.Custom(503, "Game.Maintenance.Enabled", message)` |
| `server/Api/Controllers/MaintenanceController.cs` | `GET /api/maintenance` anonymous; `POST enable` / `POST disable` behind `CardCatalogAdmin` |
| `GameInstanceService` | Create and new seats refused while enabled; a player already seated may still reload their board |
| `MatchmakingService`, `RematchHandlingService` | Queueing and rematch offers refused while enabled |
| `ApiControllerBase` | `503` mapped to a real `503 Service Unavailable` (hub callers get the code through `HubOperationResult`) |
| `PresenceSnapshot` + factory + broadcaster | `maintenanceEnabled`, `maintenanceMessage`, `activeGames`, and `AreEquivalent` compares them so a toggle is pushed |
| `client/src/views/login/LoginView.tsx` | Banner with the server's message; Host / Join / Quick match disabled; Enter submit shows a toast |
| `scripts/deploy.sh` | Prints the running api/web image and start time at the end |
| `.github/workflows/deploy.yml` | The button: drain, deploy, reopen, verify |

## Pressing it

Actions -> **Deploy** -> *Run workflow* on `main`.

Inputs: `image_tag` (empty = this commit, which is also the rollback path: pass an older sha),
`drain_timeout_minutes` (default 10), `skip_drain` (deploy now, no maintenance).

Flow: sign in as the ops account -> `POST /api/maintenance/enable` -> poll `GET /api/maintenance` until
`activeGames == 0 && waitingPlayers == 0` -> `scripts/deploy.sh <tag>` -> `if: always()` disable -> print the
running image and catalogue count.

A drain that times out logs a warning and deploys anyway: a stuck table must not be able to block deploys
forever. The maintenance flag is not persisted, so the API restart that a deploy performs reopens the site by
itself; the trailing disable exists for the case where the deploy fails before the restart.

## Secrets to add

| Name | Value |
| --- | --- |
| `HETZNER_SSH_KEY` | private key whose public half is in the box's `root` authorized_keys |
| `PHV_OPS_EMAIL`, `PHV_OPS_PASSWORD` | a card-catalogue admin account (the bootstrap account works) |
| `HETZNER_HOST` (optional) | defaults to `167.233.251.253` |
| `PHV_API_HOST`, `PHV_GAME_HOST` (optional) | default to the shipped hosts |

## Constraints worth remembering

- The flag stops new tables and new seats only; live boards keep running. It cannot save a game that is still in
  play when the container is replaced, which is why the workflow waits first.
- `GET /api/maintenance` is public: the login view and any operator can read the drain state, and `enabled` is
  the only actionable field.
- Only a card-catalogue admin may flip it; the claim is minted at login, so a token issued before the promotion
  cannot.

## Verified

- `dotnet test` -> 993 passed (10 new in `MaintenanceModeTests`: state, gate, create/queue refusal, drain counts).
- `cd client && npm run build` -> clean (type check + bundle).
