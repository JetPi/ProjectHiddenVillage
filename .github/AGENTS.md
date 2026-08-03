# Project Hidden Village Agent Harness

This file gives always-on guidance for coding agents in this repository.

## Mission

- Keep frontend and backend working together with minimal friction.
- Prioritize safe, incremental changes over broad refactors.
- Verify behavior with focused checks whenever code is changed.

## Workflow

1. Read the relevant feature area first.
2. Prefer the smallest patch that satisfies the request.
3. Keep API contracts between `client` and `server` aligned.
4. Run targeted validation after edits.
5. Summarize what changed, what was validated, and any remaining risk.

## Project Rules

- Frontend code belongs under `client/src` and should remain TypeScript-first.
- Backend API and domain logic belong under `server` and should stay C#/.NET-first.
- Avoid introducing new frameworks unless explicitly requested.
- Keep naming and folder conventions consistent with nearby code.
- Do not silently change request/response shapes across client-server boundaries.

## Validation Defaults

- Frontend edits: run lint and/or relevant tests in `client`.
- Backend edits: build `server/ProjectHiddenVillage.Server.csproj` and run relevant tests.
- Cross-cutting edits: run root-level build or targeted end-to-end checks when feasible.

## Communication

- Call out assumptions before risky changes.
- Flag blockers quickly with one proposed workaround.
- Keep final summaries concise and action-oriented.
