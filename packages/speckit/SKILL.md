---
name: SpecKit
description: |
  DEPRECATED: SpecKit has been unified into SpecFlow.
  Use SpecFlow instead for all spec-driven development.
---

# SpecKit - DEPRECATED

> **⚠️ This skill has been unified into SpecFlow**

As of January 2026, SpecKit functionality has been merged into the SpecFlow skill. All SpecKit commands are now available through SpecFlow:

| Old Command | New Command |
|-------------|-------------|
| `/speckit.specify` | `specflow specify` |
| `/speckit.plan` | `specflow plan` |
| `/speckit.tasks` | `specflow tasks` |
| `/speckit.implement` | `specflow implement` |

## Migration

If you were using SpecKit directly, simply use the SpecFlow skill instead. All functionality is preserved.

## Why Unify?

SpecKit and SpecFlow served complementary purposes:
- **SpecKit**: Individual feature specification workflow
- **SpecFlow**: Multi-feature orchestration with queue management

Unifying them provides:
1. Single entry point for spec-driven development
2. Unified CLI (`specflow`) for all operations
3. Better feature tracking with SQLite database
4. Quality gates and evals built-in
5. Fresh-context agent execution per feature

## Use SpecFlow

See `packages/specflow/SKILL.md` for the full unified workflow.
