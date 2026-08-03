---
description: "Run when verifying that client and server request/response contracts remain aligned after API or model changes."
---

# API Contract Check

Goal: detect contract mismatches between frontend and backend quickly and propose minimal fixes.

## Inputs

- Endpoint or feature area to check.
- Files or folders changed.

## Workflow

1. Locate server endpoint definitions, request DTOs, and response models.
2. Locate frontend service calls and consuming types/views.
3. Compare payload shapes, field names, nullability, and status code assumptions.
4. Flag any mismatch and propose the smallest safe correction.
5. Suggest focused validations to confirm behavior.

## Output Format

- Findings first, ordered by severity.
- For each finding: impacted files, mismatch details, and recommended fix.
- If no mismatches are found, state residual risk and missing test coverage.
