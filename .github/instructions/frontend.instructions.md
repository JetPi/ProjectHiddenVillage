---
description: "Use when working on React, routing, state, styles, or TypeScript UI code in the client app."
applyTo: "client/src/**"
---

# Frontend Instructions

## Objectives

- Preserve route behavior and auth/session flows.
- Keep types explicit and avoid `any` unless unavoidable.
- Favor reusable components and keep view logic readable.

## Implementation Guidance

- Keep API calls in `client/src/services` and avoid scattering fetch logic in views.
- Reuse existing state stores in `client/src/state` before adding new global state.
- For new routes, update router configuration and ensure fallback behavior is preserved.
- Keep styling consistent with existing theme variables and structure.
- When composing reusable UI primitives, use `tailwind-merge` to resolve class conflicts and prefer merged overrides over `!` utility modifiers.

## Validation

- Run frontend lint/build after meaningful changes.
- If a change touches forms/auth/routing, test that user path manually.

## GameView Iteration Record (2026-08-04)

- `client/src/views/game/GameView.tsx` uses `AppButton` consistently for side controls and action buttons; keep compact icon-button sizing via class overrides on the shared component.
- Shared button composition relies on `tailwind-merge`; prefer class conflict resolution through merged utilities, not `!important` utility patterns.
- Board and surrounding rows use a blue/orange split visual language with muted/translucent tones tuned via CSS variables in `client/src/index.css`.
- Turn strip behavior is state-swapped (not animated): orange/blue classes change by turn state, with text color classes mapped for readability per chosen background.
- The outer play-area split and the board split must stay visually aligned; this is handled programmatically via `client/src/views/game/useAlignedSplit.ts` using refs + `ResizeObserver` + CSS vars (`--turn-split-start`, `--turn-split-end`).
- Keep the outer split clipped with rounded corners on the outer grid wrapper to prevent color leaks at corners.
- Keep the board split (`turn-zone-split`) on the board container itself so the division remains obvious inside gameplay slots.
- Top and bottom rows intentionally inherit matching band colors (blue top, orange bottom), while the action button row tint can be reduced/removed independently for readability.
- If alignment appears off again after layout changes, verify that the measured refs still point to the correct outer wrapper and board container before adjusting percentages.
