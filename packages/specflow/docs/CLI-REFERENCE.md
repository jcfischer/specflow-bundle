# SpecFlow CLI Reference

The `specflow` CLI is installed at `~/bin/specflow`. All commands below are **bash commands**.

## Quick Reference

| Operation | Command | Notes |
|-----------|---------|-------|
| List features | `specflow status` | **Always run first** to see current state |
| Feature detail | `specflow status <id>` | Shows all fields including spec_path |
| Add feature | `specflow add "<name>" "<description>"` | IDs auto-generated (F-1, F-2...) |
| Remove feature | `specflow remove <id> [--force]` | Keeps spec files unless manually deleted |
| Edit feature | `specflow edit <id> --name/--description/--priority/--spec-path` | Cannot change ID |
| Set phase | `specflow phase <id> <phase>` | none, specify, plan, tasks, implement |
| Create spec | `specflow specify <id> [--quick] [--batch]` | Creates spec.md, sets phase |
| Enrich feature | `specflow enrich <id>` | Add missing batch fields interactively |
| Create plan | `specflow plan <id>` | Creates plan.md, sets phase |
| Create tasks | `specflow tasks <id>` | Creates tasks.md, sets phase |
| Complete | `specflow complete <id>` | Validates artifacts + Doctorow Gate |
| Complete (skip gate) | `specflow complete <id> --skip-doctorow` | Skip Doctorow Gate checklist |
| Revise | `specflow revise <id> --spec/--plan/--tasks` | Revise artifact based on feedback |
| Revise history | `specflow revise <id> --history` | Show revision history |
| Reset | `specflow reset <id>` | Return to pending |
| Skip | `specflow skip <id>` | Move to end of queue |
| Run evals | `specflow eval run` | Run quality evaluations |
| Migrate | `specflow migrate-registry` | Import from SpecKit JSON (one-time) |

## Full Command Help

Run `specflow --help` for complete command list, or `specflow <command> --help` for command-specific options.

## CLI-Only Rule

**NEVER directly manipulate the specflow database (features.db).**

The `specflow` CLI is the ONLY interface for feature management. Direct SQLite access:
- Bypasses validation and hooks
- Creates orphaned or inconsistent state
- Breaks the tooling contract

Use `specflow edit <id> --spec-path <path>` to set or update a feature's spec directory path.

## Artifact Revision

When quality gates fail or feedback requires changes:

```bash
# Revise spec with feedback
specflow revise F-1 --spec --feedback "Add more specific acceptance criteria"

# Revise plan
specflow revise F-1 --plan --feedback "Address failure modes for external APIs"

# Revise tasks
specflow revise F-1 --tasks --feedback "Break down T-1.3 into smaller units"

# Interactive mode (prompts for artifact and feedback)
specflow revise F-1

# View revision history
specflow revise F-1 --history

# Dry run (show what would happen)
specflow revise F-1 --spec --feedback "test" --dry-run
```

Every revision is tracked with unique ID, timestamp, reason, and original content preserved.
