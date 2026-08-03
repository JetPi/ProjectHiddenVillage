---
description: "Run when planning, creating, reviewing, or validating Entity Framework Core migrations in the server project."
---

# EF Migration Checklist

Goal: ensure schema changes are intentional, reversible, and safely reflected in application code.

## Inputs

- DbContext/entity/configuration files touched.
- Migration name and purpose.

## Workflow

1. Identify model/configuration changes that should map to schema changes.
2. Verify whether a migration is required; if yes, draft migration naming.
3. Check generated migration operations for unintended drops/renames.
4. Confirm model snapshot alignment.
5. Verify code paths depending on changed columns/constraints.
6. Recommend build/test commands and database upgrade/rollback checks.

## Output Format

- Migration required: yes or no, with rationale.
- Risk notes: data loss, nullability transitions, rename pitfalls.
- Validation plan: exact build/test/migrate steps.
