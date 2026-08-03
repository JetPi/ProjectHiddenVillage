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

## Validation

- Run frontend lint/build after meaningful changes.
- If a change touches forms/auth/routing, test that user path manually.
