---
description: "Use when preparing or validating a strict agent-to-agent handoff for frontend/backend orchestration tasks."
---

# Agent Handoff Template

Use this exact structure:

```markdown
HANDOFF
task_type: <frontend|backend|cross-contract|mixed>
scope:
  - <path>
changes:
  - <what changed>
validation:
  - <command/check/manual verification>
findings:
  - <bug/risk or "none">
next_step: <done|needs-frontend|needs-backend|needs-contract-check|needs-migration-check>
```

## Validation Rules

- `scope` must list concrete repository paths.
- `validation` must include at least one concrete check.
- `findings` must never be empty. Use `none` when there are no issues.
- `next_step` must be exactly one value from the allowed set.
