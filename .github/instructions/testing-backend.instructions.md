---
description: "Use when backend behavior changes require validation, including API contracts, service logic, data changes, and migrations."
applyTo: "server/**"
---

# Backend Testing Instructions

- For behavior changes, add or update targeted backend tests where practical.
- Build the backend project and run relevant server tests.
- For endpoint changes, verify status codes and response shape.
- For schema changes, validate migration safety and rollback considerations.
- The coding assistant is allowed to create and include an EF Core migration when model/schema changes warrant it, in the same work item.
- Call out any test gaps and residual risk in the final summary.
