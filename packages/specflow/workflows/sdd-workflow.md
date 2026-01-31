# Spec-Driven Development Workflow

**Version**: 2.0
**Last Updated**: 2026-01-12
**Based on**: [GitHub spec-kit](https://github.com/github/spec-kit)

## Overview

Spec-Driven Development (SDD) inverts traditional development: specifications become executable artifacts that directly generate implementations.

```
SPECIFY -> PLAN -> TASKS+IMPLEMENT -> VERIFY
   |         |           |              |
 What/Why   How    Work Items→Code   Doctorow Gate
                   (auto-chains)
```

### The Doctorow Principle

> "Code is a liability, not an asset."

Every feature adds maintenance burden. SDD explicitly tracks this through:
- **Failure Mode Analysis** in PLAN phase
- **System Context** in SPECIFY phase
- **Debt Ledger** at project level
- **Doctorow Gate** after IMPLEMENT

## Workflow Phases

### Phase 1: Specify (`specflow specify F-N`)

**Goal**: Define WHAT and WHY, explicitly avoiding HOW.

**Trigger**: User says "new feature", "spec out", "create spec", "specify"

**Begins with Interview**: Uses structured requirements elicitation via AskUserQuestion before writing the spec. Interview covers 8 phases:
1. Problem & Pain - What we're really solving
2. Users & Context - Who benefits and how
3. Technical Context - What exists today
4. Constraints & Tradeoffs - What matters most
5. User Experience - How it should feel
6. Edge Cases - What could go wrong
7. Success Criteria - How we know it's done
8. Scope & Future - What's in and out

**Actions**:
1. **Get or create feature in database**:
   - If feature doesn't exist: `specflow add <feature-name>`
   - Feature gets F-N format ID (e.g., F-1, F-2)
2. Create `.specify/specs/F-N-<feature-name>/` directory
3. Update feature's `spec_path` in database
4. Generate `spec.md` from template
5. Include:
   - User scenarios with acceptance criteria
   - Functional requirements (FR-1, FR-2...)
   - Non-functional requirements
   - Key entities
   - Success criteria
   - Assumptions
   - `[NEEDS CLARIFICATION]` markers
   - Out of scope items

**DO NOT include**:
- Technology choices
- Implementation details
- Architecture decisions
- Code samples

**Quality Gates** (manual checklist):
- All scenarios have acceptance criteria
- Requirements are testable
- Success criteria are measurable
- Ambiguities are marked
- Scope is clear
- **System context documented** (upstream, downstream, adjacent)
- **Assumptions have invalidation conditions**
- **Failure behavior specified** in NFRs

**Automatic Quality Gate**: After spec synthesis, runs `specflow eval` with spec-quality rubric:

| Criterion | Weight | What it checks |
|-----------|--------|----------------|
| Acceptance Criteria | 40% | Testable, Given/When/Then format |
| Scope Definition | 25% | In/out scope, dependencies |
| Error Handling | 20% | Failure scenarios defined |
| Technical Clarity | 15% | NFRs, constraints |

**Threshold**: Spec must score ≥ 80% before proceeding to Plan phase. If below threshold, iterate on spec to address gaps identified in eval output.

**Exit**: Spec passes eval gate (≥ 80%) AND user approves specification

### Phase 2: Plan (`specflow plan F-N`)

**Goal**: Convert specification into technical design.

**Trigger**: After spec approval, or "plan this", "technical design"

**Actions**:
1. Read approved specification
2. Generate `plan.md` from template
3. Include:
   - Architecture overview (ASCII diagram)
   - Technology stack with rationale
   - Constitutional compliance check
   - Data model (entities, schemas)
   - API contracts
   - Implementation phases
   - File structure
   - Risk assessment
   - Dependencies
   - Complexity estimate
   - **Failure Mode Analysis** (how it fails, assumption fragility, blast radius)
   - **Longevity Assessment** (maintainability, evolution vectors, deletion criteria)
   - **Debt score calculation**

**Constitutional Compliance Checklist** (pass/fail gate):
- [ ] CLI-First: Exposes command-line interface
- [ ] Library-First: Core logic as reusable module
- [ ] Test-First: TDD strategy defined
- [ ] Deterministic: Avoids probabilistic behavior
- [ ] Code Before Prompts: Logic in code, not prompts

**Automatic Quality Gate**: After plan synthesis, runs `specflow eval` with plan-quality rubric:

| Criterion | Weight | What it evaluates |
|-----------|--------|-------------------|
| Spec Traceability | 30% | Every FR/NFR has implementation approach, no scope creep |
| Architectural Soundness | 25% | Clear boundaries, follows patterns, appropriate abstractions |
| Failure Resilience | 20% | Failure modes, recovery strategies, blast radius |
| Implementation Concreteness | 15% | Actual paths, complete models, specific contracts |
| Verifiability | 10% | TDD strategy explicit, test cases map to ACs |

**Threshold**: Plan must score ≥ 80% AND pass Constitutional Compliance gate.

**Exit**: Plan passes eval gate (≥ 80%) AND user approves technical plan

### Phase 3: Tasks (`specflow tasks F-N`)

**Goal**: Break plan into implementation units, then execute them.

**Trigger**: After plan approval, or "break down", "create tasks"

**Actions**:
1. Read approved plan
2. Generate `tasks.md` from template
3. Include:
   - Task groups (Foundation, Core, Integration)
   - Task IDs (T-1.1, T-1.2...)
   - Task markers: `[T]` test required, `[P]` parallelizable
   - Dependencies: `depends: T-X.Y`
   - File paths and test locations
   - Dependency graph (ASCII)
   - Execution order
   - Progress tracking table

**Task ID Format**:
```
T-<group>.<sequence>
T-1.1 = Group 1, Task 1
T-2.3 = Group 2, Task 3
```

**Auto-chains to Phase 4**: After tasks.md is generated, immediately proceed to implementation. No user review gate - tasks flow directly into execution.

### Phase 4: Implement (auto-triggered)

**Goal**: Execute tasks with TDD enforcement on a feature branch.

**Trigger**: Automatic after Phase 3 completes (no separate command needed)

**MANDATORY: Feature Branch Workflow**

All implementation work MUST be done on a feature branch:

```bash
# 1. Create feature branch from main
git checkout main && git pull
git checkout -b spec/F-N-<feature-name>

# 2. All work happens on feature branch
# ... implement tasks ...

# 3. When complete, merge via PR or squash
git checkout main && git merge spec/F-N-<feature-name>
# OR: Create PR for review
```

**Branch Naming Convention**: `spec/F-N-<feature-name>` (e.g., `spec/F-104-tenant-isolation`)

**Actions**:

For each task in `tasks.md`, use the **PAI ISC Loop**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 🎯 ISC LOOP FOR TASK T-X.Y                                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ━━━ 📋 PLAN ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│  Define task-level Ideal State Criteria (ISC):                              │
│  - [ ] Criterion 1 (exactly 8 words, testable state)                        │
│  - [ ] Criterion 2 (exactly 8 words, testable state)                        │
│  - [ ] Test exists and fails (TDD RED)                                      │
│                                                                             │
│  ━━━ ⚡ EXECUTE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│  1. RED: Write failing test first                                           │
│     bun test path/to/test.ts  # Verify: Test fails                          │
│                                                                             │
│  2. GREEN: Write minimal implementation                                     │
│     bun test path/to/test.ts  # Verify: Test passes                         │
│                                                                             │
│  3. FULL SUITE: Run all tests                                               │
│     bun test  # Verify: ALL tests pass                                      │
│                                                                             │
│  4. BLUE: Refactor (keep tests green)                                       │
│                                                                             │
│  ━━━ ✅ VERIFY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│  Check each ISC criterion with evidence:                                    │
│  - [x] Criterion 1 - VERIFIED: [evidence]                                   │
│  - [x] Criterion 2 - VERIFIED: [evidence]                                   │
│  - [x] Test passes - VERIFIED: bun test output                              │
│                                                                             │
│  ━━━ 📚 COMMIT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│  Commit task completion:                                                    │
│  git add -A && git commit -m "spec(F-N): implement T-X.Y - <description>"   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**ISC Criteria Requirements**:
- Exactly 8 words each
- Granular (single-concern)
- Testable (binary YES/NO with evidence)
- State-based (what IS true, not what to DO)

**Task Completion Checklist**:
- [ ] Feature branch created/used
- [ ] ISC criteria defined for task
- [ ] RED: Test written and fails
- [ ] GREEN: Implementation passes test
- [ ] FULL SUITE: All tests pass
- [ ] ISC criteria verified with evidence
- [ ] Task committed to feature branch
- [ ] Task status updated in `tasks.md`

**Doctorow Gate** (after all tasks complete):
- [ ] Failure test: Break external dep → graceful failure?
- [ ] Assumption test: Behavior when key assumption wrong?
- [ ] Rollback test: Can disable without breaking other features?
- [ ] Debt recorded: Entry added to `.specify/debt-ledger.md`?

**Exit**: All tasks complete on feature branch, full test suite passes, Doctorow Gate passed, ready for merge/PR

## Directory Structure

```
project-root/
├── .specflow/
│   └── features.db           # Feature queue (SQLite)
├── .specify/
│   ├── memory/
│   │   └── constitution.md   # Project-specific principles
│   ├── debt-ledger.md        # Technical debt tracking (project-wide)
│   └── specs/
│       └── F-N-<feature-name>/   # e.g., F-1-user-auth/
│           ├── spec.md       # Phase 1: Specification
│           ├── plan.md       # Phase 2: Technical Plan
│           ├── data-model.md # Optional: Complex schemas
│           ├── contracts/    # Optional: API specs
│           └── tasks.md      # Phase 3: Implementation Tasks
└── src/                      # Phase 4: Implementation
```

**Feature ID Format**: F-N (e.g., F-1, F-2, F-35)

## Constitutional Inheritance

```
PAI CORE CONSTITUTION.md (Master)
         |
         v (inherits, cannot override)
.specify/memory/constitution.md (Project-specific)
```

Project constitutions can ADD constraints but cannot REMOVE PAI principles.

## Integration with PAI Systems

### TDD Workflow

Phase 4 triggers the TDD workflow from `CORE/overrides/TESTING.md`:
- Tests MUST come before implementation
- Full test suite runs after every task
- No proceeding until all tests pass

### CLI-First Architecture

Generated code follows PAI's CLI-First pattern:
- Library module first (`src/lib/`)
- CLI wrapper on top (`src/commands/`)
- Deterministic over probabilistic
- Code before prompts

### History Integration

Completed specs can be archived:
```bash
# After feature ships
mv .specify/specs/feature-name/ ${PAI_DIR}/MEMORY/specs/
```

## Quick Reference

| Phase | Command | Output | Gate |
|-------|---------|--------|------|
| Specify | `specflow specify F-N` | spec.md | User approval |
| Plan | `specflow plan F-N` | plan.md | User approval |
| Tasks + Implement | `specflow tasks F-N` | tasks.md + Code | Tests pass |

## When NOT to Use SDD

- Simple bug fixes (just fix it)
- Single-line changes
- Exploratory spikes (prototype first, spec later)
- Documentation-only changes
- Urgent hotfixes

## Example Session

```
User: I want to add RSS feed discovery to ragent

Claude: Let me add this feature to the queue and start the specify phase.

# specflow add "RSS feed discovery"
# Creates F-1 in database

# specflow specify F-1
# Creates .specify/specs/F-1-rss-discovery/spec.md
# User reviews scenarios and requirements
# User approves spec

# specflow plan F-1
# Creates plan.md with architecture
# User reviews technical decisions
# User approves plan

# specflow tasks F-1
# Creates tasks.md with T-1.1, T-1.2, etc.
# Auto-chains to implementation:
#   - Executes T-1.1 with TDD
#   - Writes test, verifies fail
#   - Writes implementation, verifies pass
#   - Runs full suite, all green
#   - Proceeds to T-1.2...
#   - Continues until all tasks complete
```

## References

- [GitHub spec-kit Repository](https://github.com/github/spec-kit)
- [Spec-Driven Methodology](https://github.com/github/spec-kit/blob/main/spec-driven.md)
- [GitHub Blog: SDD with AI](https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/)
- PAI CONSTITUTION.md
- PAI TESTING.md override
