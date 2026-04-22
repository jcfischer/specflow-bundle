---
name: specflow
description: |
  Payload loaded by the Development router. Orchestrates gated spec-driven
  feature development via the `specflow` CLI (~/bin/specflow): SPECIFY →
  PLAN → TASKS → IMPLEMENT, with opt-in HARDEN → REVIEW → APPROVE.
---

# SpecFlow — Spec-Driven Development

Multi-agent orchestration via the `specflow` CLI. Based on [GitHub spec-kit](https://github.com/github/spec-kit).

## Rules (load first)

1. If `.specify/` or `.specflow/` exists AND the user asks for code, run `specflow status` FIRST to orient.
2. Do NOT write implementation code until `spec.md` + `plan.md` + `tasks.md` exist AND quality gates pass.
3. Work on a feature branch `spec/F-N-<name>` — never commit feature code to `main`.
4. This skill is complete when `specflow status` shows the feature in DONE state.
5. Do NOT silently skip phases. If the user is time-constrained, invoke the trade-off dialog in `docs/TIME-PRESSURE.md`.

## Gated Flow

```
SPECIFY → PLAN → TASKS → IMPLEMENT ──┬──→ COMPLETE                    (classic)
                                      └──→ HARDEN → REVIEW → APPROVE   (extended, opt-in)
```

Do NOT advance until the current phase is validated.

## Phase Routing

| User says / state                               | Run                           | Reference                                    |
|-------------------------------------------------|-------------------------------|----------------------------------------------|
| `specflow specify F-N`, path gate + "new feature" | `specflow specify F-N`      | `workflows/specify-with-interview.md`        |
| `specflow plan F-N`                             | `specflow plan F-N`           | `workflows/sdd-workflow.md` (plan section)   |
| `specflow tasks F-N`                            | `specflow tasks F-N`          | `workflows/sdd-workflow.md` (tasks section)  |
| per-task TDD loop (PLAN/RED/GREEN/BLUE/VERIFY/COMMIT) | in-conversation         | `workflows/sdd-workflow.md` (ISC LOOP)       |
| `specflow complete F-N`                         | `specflow complete F-N`       | validates artifacts + Doctorow Gate          |
| `specflow harden F-N`                           | `specflow harden F-N`         | `workflows/extended-lifecycle.md`            |
| `specflow review F-N`                           | `specflow review F-N`         | `workflows/extended-lifecycle.md`            |
| `specflow approve/reject F-N`                   | `specflow approve/reject F-N` | `workflows/extended-lifecycle.md`            |
| `specflow inbox` / `specflow audit`             | same                          | `workflows/extended-lifecycle.md`            |

## When to Use / Skip

**Use for:** new feature, multi-file capability, integration work.
**Skip for:** bug fix, single-file tweak, config change, doc update.

## Quality Gates

| Gate                | Threshold                           | Source                              |
|---------------------|-------------------------------------|-------------------------------------|
| spec.md quality     | ≥80% (`--quick`: ≥60%)              | `docs/QUALITY-GATES.md` (spec)      |
| plan.md quality     | ≥80% AND Constitutional Compliance  | `docs/QUALITY-GATES.md` (plan)      |
| Test coverage       | ratio ≥0.3 on `complete`            | `docs/QUALITY-GATES.md`             |
| Doctorow Gate       | no placeholders; real evidence      | `docs/QUALITY-GATES.md` (doctorow)  |

## Feature Granularity

Decompose a project into 5–15 features. Each: completable in 1–4 hours, independently testable, user-visible.

## References

- CLI command reference — `docs/CLI-REFERENCE.md` (or `specflow --help`)
- Anti-patterns — `docs/ANTI-PATTERNS.md`
- Quality gate rubric — `docs/QUALITY-GATES.md`
- pai-deps integration — `docs/PAI-DEPS-INTEGRATION.md`
- Directory layout — `docs/LAYOUT.md`
- Time-pressure protocol — `docs/TIME-PRESSURE.md`
- Extended lifecycle (HARDEN/REVIEW/APPROVE/inbox/audit) — `workflows/extended-lifecycle.md`
- SDD workflow + ISC loop — `workflows/sdd-workflow.md`
- Specify interview protocol — `workflows/specify-with-interview.md`
- Templates — `templates/` (constitution, spec, plan, tasks, verify, debt-ledger)

## References (external)

- [GitHub spec-kit](https://github.com/github/spec-kit)
- PAI CONSTITUTION.md (master principles)
