---
name: SpecFlow
description: |
  Orchestrates spec-driven development using the `specflow` CLI (installed at ~/bin/specflow).
  Enforces SPECIFY → PLAN → TASKS → IMPLEMENT gated workflow with quality evals.
  Opt-in extended lifecycle: HARDEN → REVIEW → APPROVE for post-implementation quality gates.
  USE WHEN project has `.specify/` or `.specflow/` directory, user mentions F-1/F-2
  pattern, or user says "spec", "specify", "specflow", "new feature".
---

# SpecFlow - Spec-Driven Development

Multi-agent orchestration for spec-driven development using the **`specflow` CLI**.

Based on [GitHub's spec-kit](https://github.com/github/spec-kit).

---

## CLI Tool

SpecFlow uses a compiled CLI at `~/bin/specflow`. **All commands in this document are bash commands:**

```bash
# These are BASH commands executed via the Bash tool
specflow status          # View feature queue
specflow specify F-1     # Create specification
specflow plan F-1        # Create technical plan
specflow tasks F-1       # Create task breakdown
specflow complete F-1    # Mark feature complete
```

Run `specflow --help` for full command list.

---

## Workflow Routing

| Trigger | Action | File |
|---------|--------|------|
| "specify", "new feature", "create spec" | Run SPECIFY phase | `workflows/specify-with-interview.md` |
| "plan", "architecture", "technical design" | Run PLAN phase | `workflows/sdd-workflow.md` |
| "tasks", "break down", "implementation units" | Run TASKS phase | `workflows/sdd-workflow.md` |
| "complete", "finish feature", "mark done" | Run COMPLETE | `workflows/sdd-workflow.md` |
| "harden", "acceptance test" | Run HARDEN phase | See below |
| "review", "evidence package" | Run REVIEW phase | See below |
| "approve", "reject", "gate" | Run APPROVE/REJECT | See below |
| "inbox", "review queue" | Show inbox | See below |
| "audit", "drift", "health check" | Run audit | See below |
| Anti-pattern detected | Reference docs | `docs/ANTI-PATTERNS.md` |
| Quality gate questions | Reference docs | `docs/QUALITY-GATES.md` |
| pai-deps integration | Reference docs | `docs/PAI-DEPS-INTEGRATION.md` |

---

## Critical: No Code Without Specs

```
┌─────────────────────────────────────────────────────────────────┐
│  YOU MAY NOT WRITE IMPLEMENTATION CODE UNTIL:                   │
│                                                                 │
│  1. spec.md exists for the feature                              │
│  2. plan.md exists for the feature                              │
│  3. tasks.md exists for the feature                             │
│  4. Quality gates have passed (≥80%)                            │
│                                                                 │
│  If SpecFlow is loaded, you MUST follow the workflow.           │
│  If you can't follow the workflow, ASK the user first.          │
└─────────────────────────────────────────────────────────────────┘
```

### Pre-Implementation Gate Check

Before writing ANY implementation code, verify:

- [ ] `specflow status` shows feature in IMPLEMENT phase
- [ ] `.specify/specs/F-N-<name>/spec.md` exists
- [ ] `.specify/specs/F-N-<name>/plan.md` exists
- [ ] `.specify/specs/F-N-<name>/tasks.md` exists
- [ ] Quality evals passed (`specflow eval run`)
- [ ] **On feature branch**: `git checkout -b spec/F-N-<name>`

**If ANY box is unchecked, STOP and complete the missing phase.**

---

## Gated Workflow

```
SPECIFY → PLAN → TASKS → IMPLEMENT ──┬──→ COMPLETE (classic)
   |        |       |        |         └──→ HARDEN → REVIEW → APPROVE (extended)
 What/Why  How   Work Items Code
   ▼        ▼       ▼        ▼
spec.md  plan.md tasks.md   src/
```

**Gated phases**: Do NOT advance until current phase is validated.
**Two paths after IMPLEMENT**: Classic (`specflow complete`) or Extended lifecycle (opt-in).

### Phase 1: Specify (`specflow specify F-N`)

Creates spec.md through 8-phase structured interview:
1. Problem & Pain
2. Users & Context
3. Technical Context
4. Constraints & Tradeoffs
5. User Experience
6. Edge Cases
7. Success Criteria
8. Scope & Future

**Quick-Start Mode** (`--quick`): Reduced interview, 60% threshold.
**Batch Mode** (`--batch`): Non-interactive from decomposition data.

**Quality Gate**: ≥80% on spec-quality rubric (≥60% for quick-start).

See `workflows/specify-with-interview.md` for full interview protocol.

### Phase 2: Plan (`specflow plan F-N`)

Creates plan.md with:
- Architecture decisions with rationale
- Data models and schemas
- API contracts
- Failure Mode Analysis
- Constitutional compliance checklist

**Quality Gate**: ≥80% AND pass Constitutional Compliance.

### Phase 3: Tasks (`specflow tasks F-N`)

Creates tasks.md with:
- Task IDs (T-1.1, T-1.2, etc.)
- Dependencies marked (`depends: T-X.Y`)
- Test requirements marked `[T]`

**Auto-chains to Phase 4** after tasks.md is generated.

### Phase 4: Implement

**MANDATORY: Feature Branch Workflow**
```bash
git checkout -b spec/F-N-<feature-name>  # All work on feature branch
```

For **each task**, use the **PAI ISC Loop**:

1. **PLAN**: Define task-level ISC criteria (8 words, testable state)
2. **RED**: Write failing test first
3. **GREEN**: Minimal implementation to pass
4. **BLUE**: Refactor while keeping tests green
5. **VERIFY**: Check ISC criteria with evidence
6. **COMMIT**: `git commit -m "spec(F-N): implement T-X.Y"`

See `workflows/sdd-workflow.md` for full ISC loop template.

### Completion (`specflow complete F-N`)

Validates:
- All required files exist (spec.md, plan.md, tasks.md, docs.md, verify.md)
- Test coverage ratio ≥0.3
- verify.md has real output (no placeholders)
- Doctorow Gate passed

### Extended Lifecycle (Opt-in)

After IMPLEMENT, features can enter the extended lifecycle for additional quality gates:

#### Phase 5: Harden (`specflow harden F-N`)

Generates acceptance test templates from spec.md success criteria:
- AI-generated or static fallback template with `[x] PASS / [x] FAIL / [x] SKIP` checkboxes
- Human fills the template with actual test results
- Ingest with `specflow harden F-N --ingest`
- Phase advances to REVIEW when all tests pass (no failures)

#### Phase 6: Review (`specflow review F-N`)

Compiles evidence package for human review:
- Automated checks: `bun test` results, `tsc --noEmit` type checking
- File alignment: verifies backtick-referenced files exist
- Acceptance test results summary
- Creates approval gate and writes `review-package.md`

#### Phase 7: Approve/Reject

- `specflow approve F-N [F-N2 ...]` — batch approve pending gates, marks features complete
- `specflow reject F-N --reason "..."` — writes feedback.md, returns feature to implement phase

#### Inbox (`specflow inbox`)

Priority-ranked review queue:
- **P0**: Features with failures or blocked status
- **P1**: Passed review, waiting <24h
- **P2**: Passed review, waiting ≥24h
- Suggests batch approve command for clean items

#### Audit (`specflow audit [F-N]`)

Detects spec-reality drift:
- DB status consistency (phase vs status alignment)
- Artifact completeness (expected files for current phase)
- Spec-code alignment (backtick file references exist)

---

## Quick Start

```bash
# New project
specflow init "Project description"
specflow status

# Add and spec a feature
specflow add "feature-name" "Description"
specflow specify F-1
specflow plan F-1
specflow tasks F-1

# Create feature branch and implement
git checkout -b spec/F-1-feature-name
# ... implement with TDD + ISC loop ...

# Complete and merge
specflow complete F-1
git checkout main && git merge spec/F-1-feature-name
```

---

## CLI Command Quick Reference

| Command | Purpose |
|---------|---------|
| `specflow status` | Show feature queue and progress |
| `specflow add` | Add new feature |
| `specflow specify F-N` | Create spec.md |
| `specflow plan F-N` | Create plan.md |
| `specflow tasks F-N` | Create tasks.md |
| `specflow complete F-N` | Mark feature complete |
| `specflow eval run` | Run quality evaluations |
| `specflow revise F-N` | Revise artifact based on feedback |
| `specflow harden F-N` | Generate acceptance test template |
| `specflow harden F-N --ingest` | Ingest filled acceptance results |
| `specflow review F-N` | Compile evidence package |
| `specflow approve F-N` | Approve pending gate(s) |
| `specflow reject F-N` | Reject with feedback |
| `specflow inbox` | Priority-ranked review queue |
| `specflow audit` | Detect spec-reality drift |

See `docs/CLI-REFERENCE.md` for full command reference.

---

## Directory Structure

```
project-root/
├── .specflow/
│   └── features.db           # Feature queue (SQLite)
├── .specify/
│   ├── memory/constitution.md
│   ├── debt-ledger.md
│   └── specs/F-N-<name>/
│       ├── spec.md
│       ├── plan.md
│       ├── tasks.md
│       ├── docs.md
│       ├── verify.md
│       ├── acceptance-test.md   # (extended lifecycle)
│       ├── review-package.md    # (extended lifecycle)
│       └── feedback.md          # (on rejection)
└── src/
```

---

## Feature Granularity

Projects must decompose into **5-15 features**:
- Each completable in 1-4 hours
- Each independently testable
- Each a user-visible capability

---

## When to Use SpecFlow

**ALWAYS use for:**
- Any NEW FEATURE (command, capability, integration)
- Multi-file changes that add functionality

**DO NOT use for:**
- Bug fixes
- Single-file tweaks
- Config changes
- Documentation updates

---

## Handling Time Pressure

If time-constrained, ASK explicitly:

```
"SpecFlow requires full spec/plan/tasks for each feature. Options:
1. Full SpecFlow for 2-3 features instead of 8
2. Skip SpecFlow and code directly
3. Hybrid: Full specs for core features only

Which approach would you prefer?"
```

Never silently skip phases.

---

## Extended Documentation

| Topic | File |
|-------|------|
| Full SDD workflow | `workflows/sdd-workflow.md` |
| Interview protocol | `workflows/specify-with-interview.md` |
| Anti-patterns | `docs/ANTI-PATTERNS.md` |
| CLI reference | `docs/CLI-REFERENCE.md` |
| Quality gates | `docs/QUALITY-GATES.md` |
| pai-deps integration | `docs/PAI-DEPS-INTEGRATION.md` |

## Templates

Available in `templates/`:
- `constitution.md`, `spec.md`, `plan.md`, `tasks.md`, `verify.md`, `debt-ledger.md`

---

## References

- [GitHub spec-kit](https://github.com/github/spec-kit)
- PAI CONSTITUTION.md - Master principles
