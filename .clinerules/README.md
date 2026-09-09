# Project Hidden Village — Agent Rules (index)

Every `.md`/`.txt` in `.clinerules/` is loaded by Cline. Files with a YAML
`paths:` frontmatter block load **only when a matching path is in context**;
files without it are always active. Keep always-on files short so startup stays
cheap, and put fine-grained detail in the path-scoped files (consult them when a
task touches that area).

## Stack

- `client/` — React 19 + TypeScript + Vite + Tailwind CSS.
- `server/` — ASP.NET Core minimal API + EF Core + PostgreSQL.
- `e2e/` — Playwright (`npm run test:e2e` → `http://127.0.0.1:4173/game/TEST1`).

## Golden rules (apply to every task)

- **Read before you edit** and validate before you finish: client `npm run build`
  (`tsc -b && vite build`) + `npm run lint`, server `dotnet build` / `dotnet test`,
  and Playwright for targeting/summon/set-support/mulligan UX changes.
- **Import barrels, no cycles**: external files import from
  `@/views/game/components` and `@/views/game/types` barrels only; never import a
  barrel from inside the folder it aggregates; siblings import each other via
  direct relative paths.
- **Refs / React Compiler lint (react-hooks v7)**: never read or forward refs
  during render. Owners keep `useRef` and expose stable `RefCallback` mount
  handlers from the hook that owns the ref; `.current` is read only inside
  effects/handlers. No eslint-disables; whole `client/src` lints clean.
- **Backend is authoritative** for legality/timing. The frontend is a pure
  consumer of `AvailableActions`, prompt state, and `GetCardActionTargets`
  responses.
- **If you intentionally change UX, update the matching Playwright spec** that
  encoded the old behavior.
- **Fish shell**: long-running commands time out in tool output — run them
  detached (`nohup … > /tmp/x.log 2>&1 & disown`) and poll the log with
  `read_files`; capture grep/eslint output in a file before reading it.

## Commands (quick)

- Frontend dev/build/lint: `cd client && npm run dev` / `npm run build` /
  `npm run lint`.
- Backend: `dotnet watch run --project server/ProjectHiddenVillage.Server.csproj
  --urls http://127.0.0.1:3001`; tests `dotnet test
  server/tests/ProjectHiddenVillage.Server.Tests/ProjectHiddenVillage.Server.Tests.csproj`.
- E2E: `npm run test:e2e`.

## Rule files (consult the one whose area you touch)

| File | Loads when paths match | Covers |
| --- | --- | --- |
| `01-architecture.md` | `client/src/**`, `server/**` | structure, barrels, refs patterns, anchors |
| `02-board-ui-hud.md` | board/card UI + `index.css` + battle-visuals e2e | overlays, stat badges, targeting highlight CSS |
| `03-targeting-contract.md` | game client, server game engine/API, e2e | targeting flows, action formats, submit decisions |
| `04-state-phase-effects.md` | stores, game hooks/effects, phase engine | Zustand, prune, auto-advance, draw/mulligan gating |
| `05-server-models-serialization.md` | `server/**`, `client/src/services/api/**` | response DTOs, STJ serialization gotcha, stat pipeline |
| `99-workflow-tooling.md` | always | environment/tooling/edit gotchas (keep short) |
