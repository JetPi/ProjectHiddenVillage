# Small-Box Deployment Tuning Plan

Goal: run this app on the box we actually have — **Hetzner CPX02, 1 vCPU / ~927 MiB / 20 GB** — with docker compose + Caddy, and collect every memory/CPU booster in one place so none of them get lost. Coolify is deliberately **out** of the plan (see §7).

Nothing in §5 changes product behaviour; it caps worst cases that a 1 GiB machine cannot absorb. That is why each item below is a config value or a deployment flag rather than a rewrite.

---

## 1. The box, measured

| Property | Value | Evidence |
|---|---|---|
| Type | CPX02 (1 AMD EPYC-Genoa vCPU, ~927 MiB RAM, 20 GB SSD) | `lscpu`, `/proc/meminfo` (`MemTotal: 949588 kB`) |
| OS | Ubuntu 26.04.1 LTS | `/etc/os-release` |
| Location | `nbg1-dc3` (Nuremberg) | Hetzner metadata |
| Swap | 4 GB `/swapfile`, active, in `/etc/fstab` | `swapon --show` |
| Disk free | ~13 GB after the swapfile | `df -h /` |
| Access | `root@167.233.251.253` via `~/.ssh/id_ed25519` (no password auth) | verified `ssh -o BatchMode=yes` |

## 2. Memory budget (the number that decides everything)

| Component | Reserve | Notes |
|---|---|---|
| Kernel + Docker daemon | ~250 MB | fixed |
| Postgres (tuned, §5 B5) | ~120 MB | `shared_buffers` 64 MB |
| .NET API at rest | ~200 MB | with §5 B4 GC caps |
| nginx (client) | ~15 MB | static files only |
| Caddy | ~30 MB | TLS + proxy |
| **Fixed total** | **~615 MB** | of 927 MiB |
| **Left for live games + spikes** | **~300–400 MB** | ~8–15 concurrent tables |
| Coolify (rejected, §7) | +350–500 MB | would leave 50–150 MB — i.e. nothing |

Per live table, for reference: `GameState` ≈ 150–400 KB, plus up to [`MaxRewindPoints`](../../server/Engine/GameRedoOptions.cs:17) full board clones ≈ 3–7 MB worst case, plus ≤200 chat messages. Games are **not** the load; the runtime and the database are.

## 3. Deployment shape (decision record)

| Choice | Why |
|---|---|
| docker compose + Caddy, not Coolify | Caddy ≈ 30 MB for automatic TLS + WebSocket upgrade; Coolify's control plane costs 350–500 MB for a UI we can replace with three files |
| Images built in GitHub Actions, pushed to GHCR | A `dotnet publish` + `vite build` needs 2–3 GB and 100 % of the single core for 10–20 min. The server must only `docker pull` |
| Existing root [`Dockerfile`](../../Dockerfile:1) and [`client/Dockerfile`](../../client/Dockerfile:1) | Unchanged; Coolify/Render/compose all consume the same images. Only the `$PORT` wrapper would be needed on Render |
| Exactly **one** API replica, forever | [`InMemoryGameInstanceRegistry`](../../server/Program.cs:59), `PresenceRegistry` ([`server/Program.cs:173`](../../server/Program.cs:173)) and the chat/rematch stores are in-process; two replicas means two disjoint game worlds |
| Redeploys drop live games | Consequence of the above on any host, including Fly. Announce maintenance, or drain the reaper grace window first |

## 4. The boosters, at a glance

| ID | Booster | Current | Target | Kind |
|---|---|---|---|---|
| B1 | Redo rewind depth | 20 | **8** | appsettings |
| B2 | Chat retention | 200 msgs / 2000 rooms | **50 / 200** | appsettings |
| B3 | Card-art upload ceiling | 40 Mpx / 20 MB | **8 Mpx / 5 MB** | appsettings |
| B4 | .NET GC posture | server GC, no hard limit | workstation GC + heap cap | env |
| B5 | Postgres tuning | defaults (128 MB shm target, 100 conns) | `shared_buffers=64MB`, `work_mem=4MB`, `max_connections=20` | postgres cmd |
| B6 | EF/Npgsql pool | 100 | **20** | connection string |
| B7 | Container ceilings | none | `mem_limit` per service | compose |
| B8 | Build location | unspecified | CI → GHCR, never on box | CI + compose |
| B9 | Art-cache warming | cold after deploy | one warm pass | deploy script |
| B10 | Swap posture | 4 GB swapfile, swappiness default 60 | `vm.swappiness=10`, optional 1 GB zram | sysctl |
| B11 | Migrate on startup | Development-only gate | `Database__MigrateOnStartup=true` honored in any env | code |
| B12 | Reference-data seeding | Development-only seeders | prod-safe catalog + rulesets behind a flag | code |
| B13 | Observability | none | `docker stats` snapshot + OOM watch | ops |
| B14 | Docker disk hygiene | none | weekly prune of unused images/build cache | timer |
| B15 | Card art off-box | local volume | object storage (future) | future |

## 5. Booster detail

### B1 — Reduce `MaxRewindPoints` 20 → 8
- **Why:** each rewind point is a full deep clone ([`GameStateSnapshot.Clone()`](../../server/Engine/Services/GameStateSnapshot.cs:55)); 20 of them per table is the single largest per-game allocation.
- **How:** `GameRedo:MaxRewindPoints=8` in [`server/appsettings.json`](../../server/appsettings.json:40) (already wired through [`GameRedoOptions`](../../server/Engine/GameRedoOptions.cs:17)).
- **Risk:** players lose deep rewind chains. 8 undo points remains generous for a card game.

### B2 — Cap chat retention
- **Why:** 200 messages × 500 chars × up to 2000 rooms is a bounded but large worst case in a 927 MiB process.
- **How:** `GameChat:MaxMessagesPerGame=50`, `GameChat:MaxRooms=200` ([`server/appsettings.json`](../../server/appsettings.json:59)).

### B3 — Tighten card-art limits
- **Why:** ImageSharp decodes to raw pixels; 40 Mpx ≈ 160 MB of pixels plus working copies, so one admin upload can transiently ask for 300–500 MB. This is the most likely single-click OOM on this box.
- **How:** `CardArt:MaxUploadPixels=8000000`, `CardArt:MaxSourceBytes=5242880` ([`server/appsettings.json`](../../server/appsettings.json:14)).
- **Note:** on-demand resizing for board loads is the same code path — a cold cache plus a full board is a burst of decodes, which is what B9 mitigates.

### B4 — .NET GC posture
- **Why:** server GC reserves per-core heaps and grows aggressively; on a 1 GiB box with a single core that is the wrong default.
- **How (env on the api service):**
  ```
  DOTNET_gcServer=0
  DOTNET_GCHeapHardLimitPercent=40      # 40% of the container limit (B7)
  DOTNET_GCConserveMemory=5
  ```
- **Verify:** `docker stats --no-stream` stability over 24 h; no gen-2 growth trend.

### B5 — Postgres tuning
- **Why:** the default 128 MB `shared_buffers` target and 100 connections are sized for a machine 8× bigger.
- **How:** in the `postgres` service command:
  ```
  postgres -c shared_buffers=64MB -c work_mem=4MB -c maintenance_work_mem=32MB
           -c effective_cache_size=256MB -c max_connections=20 -c random_page_cost=1.1
  ```
- **Also:** `shm_size: 128mb` on the service so parallel queries do not error.

### B6 — Bound the EF connection pool
- **Why:** `max_connections=20` is meaningless if Npgsql can open 100 and queue the rest as errors.
- **How:** append `Maximum Pool Size=20;Timeout=15` to `ConnectionStrings__DefaultConnection`.

### B7 — Per-container ceilings
- **Why:** on 1 GiB, one runaway container takes the whole box. A limit turns a machine-wide OOM into a single-container restart.
- **How:** compose `mem_limit` and `restart: unless-stopped`:
  | Service | `mem_limit` |
  |---|---|
  | api | 500m |
  | postgres | 400m |
  | caddy | 80m |
  | web | 64m |
- **Note:** this is what makes B4's `GCHeapHardLimitPercent` meaningful — it is a percentage of the container limit.

### B8 — Never build on the box
- **Why:** the build is the only step that legitimately needs gigabytes; the runtime does not.
- **How:** GitHub Actions job builds `./Dockerfile` (root context, required by [`server/ProjectHiddenVillage.Server.csproj`](../../server/ProjectHiddenVillage.Server.csproj:34) linking `../test-data/seed-profiles.json`) and `./client/Dockerfile`, tags both `:sha-<short>` and `:latest`, pushes to GHCR. The server runs `docker compose pull && docker compose up -d`.
- **Bonus:** CI becomes the only place `dotnet`/`npm` must exist, which removes the "no laptop" problem entirely.

### B9 — Warm the art cache after each deploy
- **Why:** the first board load after a deploy decodes dozens of images on the single core, which is where players feel lag and where RAM peaks.
- **How:** a loop in `deploy.sh` requesting a handful of `/api/card-art/{id}` URLs once the container is healthy.

### B10 — Swap posture
- **Why:** swap should be a backstop, not a working tier; default swappiness 60 makes the kernel evict hot pages early.
- **How:**
  ```
  sysctl -w vm.swappiness=10            # persist in /etc/sysctl.d/99-phv.conf
  ```
- **Optional:** 1 GB zram (compressed RAM swap, ~10× faster than the disk swapfile) in front of the 4 GB file. Only if measurement shows swap churn.

### B11 — Config-driven migrate-on-startup
- **Why:** today the `MigrateAsync()` call lives inside the `IsDevelopment()` block ([`server/Program.cs:446`](../../server/Program.cs:446)), so Production never creates its schema and every DB call 500s. Without this, migrating requires a local SDK — the exact thing this deployment is trying to avoid.
- **How:** honor the existing `Database:MigrateOnStartup` key in any environment (it is already read at [`server/Program.cs:455`](../../server/Program.cs:455), just unreachable outside Development), and set `Database__MigrateOnStartup=true` for the api service.
- **Guard:** keep it off by default in the image so a misconfigured container cannot migrate by accident.

### B12 — Production-safe reference-data seeding
- **Why:** with the Development seeders gated off ([`server/Program.cs:461`](../../server/Program.cs:461)), Production has an empty card catalog and no deck rulesets — the UI loads and shows nothing.
- **How:** a separate seeder for **reference data only** (card catalog from `test-data/seed-profiles.json`, deck rulesets), behind `Database:SeedReferenceData=true`. It must not create demo users, decks or games.

### B13 — Observability
- **Why:** without numbers, "it got slow" is unfalsifiable.
- **How:**
  - `docker stats --no-stream` and `free -m` captured after a deploy and on every incident.
  - `journalctl -k | grep -i "killed process"` to distinguish an OOM kill from an app crash.
  - Hetzner's CPU/RAM graphs, and Alert on high memory in the dashboard.
  - Swap usage is the early-warning signal; steady non-zero swap means the box is undersized for the current config.

### B14 — Docker disk hygiene
- **Why:** 20 GB total; images plus build cache grow quietly.
- **How:** weekly `docker image prune -af --filter "until=336h"` and `docker builder prune -f` via a systemd timer, or `docker system prune -f` with a `--filter` on age. Never prune volumes (`--volumes` would delete `pgdata`).

### B15 — Card art off-box (future)
- **Why:** local volume is the last stateful thing on a single-disk box.
- **How:** S3-compatible storage (Hetzner Storage Box, Cloudflare R2) behind `ICardArtService`; only worth doing when uploads matter.

## 6. Execution order

- [ ] **Phase 0 — box (no app involvement):** B10 swappiness, B14 prune timer, confirm swap in `/etc/fstab`, record B13 baseline (`free -m`, `docker stats` before anything runs).
- [ ] **Phase 1 — compose stack:** `docker-compose.yml` (api, web, postgres, caddy), `Caddyfile` for the two hostnames, `.env`, `deploy.sh` implementing B8 + B9, B5 + B6 + B7 settings baked in.
- [ ] **Phase 2 — code/config flags:** B11 migrate-on-startup, B12 reference-data seeding, B1 + B2 + B3 appsettings values.
- [ ] **Phase 3 — CI:** GH Actions workflow building + pushing both images to GHCR (the repo already runs Actions via [`.github/workflows/e2e.yml`](../../.github/workflows/e2e.yml:1)).
- [ ] **Phase 4 — prove it:** deploy, warm the cache (B9), run 4–6 concurrent games, capture `docker stats` and `free -m`, then leave the box idle for an hour and confirm no swap growth and no OOM in `journalctl`.

## 7. Rejected options (and why they stay documented)

| Option | Rejected because |
|---|---|
| Fly.io Machines | Account card rejected by their payment processor; the trial also force-stops Machines at 5 min uptime, which is what produced the `NpgsqlException: Name or service not known` 500s when `phv-db` slept |
| Coolify on CPX02 | 350–500 MB of control plane on a 927 MiB box leaves ~50–150 MB for games and art bursts; its build-on-server default is exactly the 2–3 GB spike this box cannot take |
| Coolify on CPX12 | Works, but $6/mo buys RAM that the control plane immediately consumes, and 1 vCPU + 20 GB stay as the real limits |
| Render free | Spins down after ~15 min idle, which destroys every in-progress game and both SignalR connections |
| Cloud Run | Needs `--min-instances=1 --max-instances=1 --no-cpu-throttling` to keep the hosted timers and game registry alive, plus Cloud SQL and GCS — more assembly for more money than a VPS |
| Managed Postgres (Neon/Supabase) *as the DB* | Not rejected outright — it remains the fallback if local Postgres on one disk becomes a durability concern; it just does not help with CPU or the API's own footprint |

## 8. When to re-evaluate the box

Upgrade (CPX12 for RAM, or a 2 vCPU class for headroom) when any of these is true, not before:

- Steady-state swap usage stays non-zero during normal play (B13).
- `docker stats` shows the api service pinned at its 500 MB limit during ordinary board loads.
- Concurrent tables regularly exceed ~10.
- You want on-box builds back (they need 2–3 GB and a full core).
- You add a second app or a second person deploying — that is when Coolify's fixed cost stops looking expensive.
