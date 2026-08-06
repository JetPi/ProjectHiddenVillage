---
description: "Use when working on ASP.NET API controllers, services, data models, EF Core, and backend tests."
applyTo: "server/**"
---

# Backend Instructions

## Objectives

- Keep API contracts stable and version-safe.
- Maintain clear separation: controller, service, data access.
- Favor deterministic logic and testable service boundaries.

## Implementation Guidance

- Put HTTP concerns in controllers and business rules in services.
- Prefer dependency injection over static/global state.
- Keep request validation explicit and fail with clear messages.

## Validation

- Build the server project after changes.
- Run targeted tests under `tests/ProjectHiddenVillage.Server.Tests` when behavior changes.
- For endpoint changes, verify response shape and status code behavior.
- The coding assistant is allowed to create and include an EF Core migration when model/schema changes warrant it.
