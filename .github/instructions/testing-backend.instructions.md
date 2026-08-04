---
description: "Use when backend behavior changes require validation, including API contracts, service logic, data changes, and migrations."
applyTo: "server/**"
---

# Backend Testing Instructions

- For behavior changes, add or update targeted backend tests where practical.
- Build the backend project and run relevant server tests.
- For endpoint changes, verify status codes and response shape.
- For schema changes, do not create or run EF Core migrations unless the user explicitly approves it; when approved, validate migration safety and rollback considerations.
- Call out any test gaps and residual risk in the final summary.
