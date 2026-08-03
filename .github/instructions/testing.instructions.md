---
description: "Use when adding or changing tests, or when changing behavior that requires validation in frontend or backend."
applyTo: "tests/**"
---

# Testing Instructions

## Test-First Mindset

- For behavior changes, update or add tests close to the changed code.
- Prefer small, deterministic tests over broad integration-only coverage.
- Keep test names explicit about expected behavior.

## Frontend Validation

- For UI/state/routing/auth changes, run frontend lint and tests when available.
- Verify critical paths manually if automated coverage is missing.
- Keep component logic testable by isolating side effects.

## Backend Validation

- For API/service/data changes, build backend and run targeted server tests.
- Validate HTTP status codes and response shape for endpoint changes.
- If schema changes are introduced, include migration verification.

## PR-Ready Checklist

- New behavior is covered by tests or explicitly documented as a gap.
- Existing related tests still pass.
- Risk areas and manual checks are listed in the final summary.
