---
name: SpecFlow
description: |
  Spec-driven development workflow. AUTO-LOAD when:
  - Project has `.specify/` directory
  - Project has `.specflow/` directory
  - User mentions "F-1", "F-2", "F-XXX" pattern
  - User says "spec", "specify", "specflow", "new feature"
---

# SpecFlow - Spec-Driven Development

Multi-agent orchestration for spec-driven development. Enforces SPECIFY → PLAN → TASKS → IMPLEMENT gated phases.

Based on [GitHub's spec-kit](https://github.com/github/spec-kit).

---

## ⛔ CRITICAL: NO CODE WITHOUT SPECS

**STOP. Read this before doing anything.**

```
┌─────────────────────────────────────────────────────────────────┐
│  YOU MAY NOT WRITE IMPLEMENTATION CODE UNTIL:                   │
│                                                                 │
│  1. spec.md exists for the feature                              │
│  2. plan.md exists for the feature                              │
│  3. tasks.md exists for the feature                             │
│  4. Quality gates have passed (≥80%)                            │
│                                                                 │
│  "It's just a demo" is NOT a valid exception.                   │
│  "Time pressure" is NOT a valid exception.                      │
│  "It's a simple feature" is NOT a valid exception.              │
│                                                                 │
│  If SpecFlow is loaded, you MUST follow the workflow.           │
│  If you can't follow the workflow, ASK the user first.          │
└─────────────────────────────────────────────────────────────────┘
```

### Pre-Implementation Gate Check

Before writing ANY implementation code, verify:

- [ ] `specflow status` shows feature in IMPLEMENT phase (not pending/none)
- [ ] `.specify/specs/F-N-<name>/spec.md` exists and is complete
- [ ] `.specify/specs/F-N-<name>/plan.md` exists and is complete
- [ ] `.specify/specs/F-N-<name>/tasks.md` exists with task breakdown
- [ ] Quality evals have been run (`specflow eval run`)

**If ANY box is unchecked, STOP and complete the missing phase.**

---

## 🚫 Anti-Patterns (What NOT To Do)

These are documented failures. Do not repeat them.

### Anti-Pattern 1: "Init and Abandon"

```bash
# WRONG - This is NOT using SpecFlow
specflow init --from-features features.json
# ... immediately starts writing code ...
# ... never runs specify, plan, or tasks ...
# Result: specflow status shows 0% at end
```

**Why it's wrong**: Running `specflow init` without following through with `specify`, `plan`, `tasks` for each feature means you're not using SpecFlow at all.

### Anti-Pattern 2: "Quick Questions Instead of Interview"

```
# WRONG - This is NOT the interview process
AskUserQuestion: "React or Vue?" "Auth or no auth?"
# ... 4 quick multiple choice questions ...
# ... skips to implementation ...
```

**Why it's wrong**: The SPECIFY phase requires an 8-phase structured interview covering Problem, Users, Context, Constraints, UX, Edge Cases, Success Criteria, and Scope. A few clarifying questions is not the same thing.

### Anti-Pattern 3: "Time Pressure Rationalization"

```
# WRONG - Internal monologue
"Since this is a one-day demo, I'll skip the spec process..."
"The user wants this fast, so I'll just code it..."
"This is simple enough that I don't need specs..."
```

**Why it's wrong**: If the user asked for SpecFlow, they want the process. If time is limited, build fewer features with full specs rather than more features with no specs. ASK before deviating.

### Anti-Pattern 4: "TodoWrite for Code, Not Process"

```
# WRONG - Tracking only implementation
todos: [
  "Implement SSL scanner",
  "Implement DNS scanner",
  "Build frontend"
]
```

**Correct approach**:
```
# RIGHT - Tracking SpecFlow phases
todos: [
  "F-1: Run specflow specify",
  "F-1: Conduct 8-phase interview",
  "F-1: Write spec.md",
  "F-1: Run spec-quality eval",
  "F-1: Run specflow plan",
  "F-1: Write plan.md",
  "F-1: Run plan-quality eval",
  "F-1: Run specflow tasks",
  "F-1: Write tasks.md",
  "F-1: Implement T-1.1 (RED→GREEN→BLUE)",
  "F-1: Implement T-1.2",
  "F-1: Create verify.md",
  "F-1: Run specflow complete"
]
```

### Anti-Pattern 5: "Test File as TDD"

```
# WRONG - Writing one test file is not TDD
- Created tests/domain-validator.test.ts
- Implemented everything else without tests
- "I did TDD" ❌
```

**Why it's wrong**: TDD means RED→GREEN→BLUE for EVERY task. One test file for one component while 8 other components have zero tests is not TDD.

---

## Correct Workflow Example

Here's what proper SpecFlow execution looks like for ONE feature:

```bash
# 1. Initialize (once per project)
specflow init "Project description"
# or
specflow init --from-features features.json

# 2. SPECIFY phase for F-1
specflow specify F-1
# → Triggers 8-phase interview via AskUserQuestion
# → You ask questions about Problem, Users, Context, etc.
# → Synthesize into spec.md
# → spec.md created in .specify/specs/F-1-<name>/

# 3. Validate spec quality
specflow eval run --rubric spec-quality
# → Must score ≥80% to proceed
# → If <80%, improve spec.md and re-run

# 4. PLAN phase for F-1
specflow plan F-1
# → Read spec.md
# → Write plan.md with architecture, failure modes, Constitutional checklist
# → plan.md created in .specify/specs/F-1-<name>/

# 5. Validate plan quality
specflow eval run --rubric plan-quality
# → Must score ≥80% AND pass Constitutional Compliance
# → If fails, improve plan.md and re-run

# 6. TASKS phase for F-1
specflow tasks F-1
# → Break plan into T-1.1, T-1.2, etc.
# → Mark dependencies, test requirements
# → tasks.md created in .specify/specs/F-1-<name>/

# 7. IMPLEMENT phase (now you may write code)
# For each task in tasks.md:
#   a. Write failing test (RED)
#   b. Write minimal code to pass (GREEN)
#   c. Refactor (BLUE)
#   d. Verify full test suite passes

# 8. Complete F-1
specflow complete F-1
# → Validates all artifacts exist
# → Validates tests pass
# → Validates verify.md has real output

# 9. Only NOW proceed to F-2
specflow specify F-2
# ... repeat ...
```

**Total phases for one feature: 8 steps before implementation code.**

---

## Core Philosophy

> "Specifications don't serve code - code serves specifications."

Instead of coding first and writing docs later, start with a spec. This spec becomes the source of truth your tools and AI agents use to generate, test, and validate code.

### The Doctorow Principle

> "Code is a liability, not an asset. The capabilities code generates are valuable, but the code itself requires constant maintenance."

Every feature adds not just capability but also **maintenance burden**. SpecFlow tracks this through:
- **Failure Mode Analysis** — How will this code break?
- **System Context Mapping** — What depends on this? What does this depend on?
- **Technical Debt Ledger** — Explicit tracking of liability
- **Longevity Assessment** — When should this code be deleted?
- **Doctorow Gate** — Post-implementation verification that code "fails well"

---

## CRITICAL: CLI-Only Rule

**NEVER directly manipulate the specflow database (features.db).**

The `specflow` CLI is the ONLY interface for feature management. Direct SQLite access:
- Bypasses validation and hooks
- Creates orphaned or inconsistent state
- Breaks the tooling contract

**Exception:** Linking orphaned spec directories (spec_path field only) when CLI has no equivalent command.

---

## CLI Command Reference

| Operation | Command | Notes |
|-----------|---------|-------|
| List features | `specflow status` | **Always run first** to see current state |
| Add feature | `specflow add "<name>" "<description>"` | IDs auto-generated (F-1, F-2...) |
| Remove feature | `specflow remove <id> [--force]` | Keeps spec files unless manually deleted |
| Edit feature | `specflow edit <id> --name/--description/--priority` | Cannot change ID |
| Set phase | `specflow phase <id> <phase>` | none, specify, plan, tasks, implement |
| Create spec | `specflow specify <id>` | Creates spec.md, sets phase |
| Create plan | `specflow plan <id>` | Creates plan.md, sets phase |
| Create tasks | `specflow tasks <id>` | Creates tasks.md, sets phase |
| Complete | `specflow complete <id>` | Validates artifacts + tests + verify.md |
| Reset | `specflow reset <id>` | Return to pending |
| Skip | `specflow skip <id>` | Move to end of queue |
| Run evals | `specflow eval run` | Run quality evaluations |
| Migrate | `specflow migrate-registry` | Import from SpecKit JSON (one-time) |

---

## Four-Phase Workflow

```
SPECIFY -> PLAN -> TASKS -> IMPLEMENT
   |         |        |         |
 What/Why   How    Work Items  Code
   ▼         ▼        ▼         ▼
spec.md   plan.md  tasks.md   src/
```

**Gated phases**: Do NOT advance until current phase is validated.

### Phase 1: Specify (`specflow specify F-N`)

**Begins with Interview**: Uses structured requirements elicitation via AskUserQuestion before writing the spec.

Interview covers 8 phases:
1. Problem & Pain - What we're really solving
2. Users & Context - Who benefits and how
3. Technical Context - What exists today
4. Constraints & Tradeoffs - What matters most
5. User Experience - How it should feel
6. Edge Cases - What could go wrong
7. Success Criteria - How we know it's done
8. Scope & Future - What's in and out

After interview, synthesizes answers into spec containing:
- User journeys and scenarios
- Functional requirements (with failure behavior)
- Success criteria
- Key entities
- Assumptions (with invalidation conditions)
- System Context (upstream, downstream dependencies)
- `[NEEDS CLARIFICATION]` markers for ambiguities

**DO NOT include** in spec:
- Technology choices
- Implementation details
- Architecture decisions
- Code samples

**Output**: `.specify/specs/F-N-<feature>/spec.md`

**Quality Gate**: Spec must score ≥ 80% on spec-quality rubric before proceeding.

```bash
# Verify before proceeding
specflow eval run --rubric spec-quality
# If <80%, fix spec.md and re-run
```

### Phase 2: Plan (`specflow plan F-N`)

Convert specification into technical design:
- Architecture decisions with rationale
- Data models and schemas
- API contracts
- Technology choices
- Constitutional compliance check
- **Failure Mode Analysis** — How code fails, assumption fragility, blast radius
- **Longevity Assessment** — Maintainability, evolution vectors, deletion criteria
- **Debt score calculation** — Explicit liability tracking

**Constitutional Compliance Checklist** (pass/fail gate):
- [ ] CLI-First: Exposes command-line interface
- [ ] Library-First: Core logic as reusable module
- [ ] Test-First: TDD strategy defined
- [ ] Deterministic: Avoids probabilistic behavior
- [ ] Code Before Prompts: Logic in code, not prompts

**Output**: `.specify/specs/F-N-<feature>/plan.md`

**Quality Gate**: Plan must score ≥ 80% AND pass Constitutional Compliance.

```bash
# Verify before proceeding
specflow eval run --rubric plan-quality
# If <80% or Constitutional fails, fix plan.md and re-run
```

### Phase 3: Tasks (`specflow tasks F-N`)

Break plan into reviewable units:
- Task IDs (T-1.1, T-1.2, etc.)
- Dependencies marked (`depends: T-X.Y`)
- Parallel tasks marked `[P]`
- Test requirements marked `[T]`
- Dependency graph (ASCII)
- Execution order

**Output**: `.specify/specs/F-N-<feature>/tasks.md`

**Auto-chains to Phase 4**: After tasks.md is generated, immediately proceed to implementation.

### Phase 4: Implement (auto-triggered)

Execute tasks with TDD enforcement:
1. **RED**: Write failing test first
2. **GREEN**: Minimal implementation to pass
3. **BLUE**: Refactor while keeping tests green
4. **VERIFY**: Run full test suite (`bun test`)

**DO NOT proceed to next task until:**
- Current task's tests pass
- Full test suite passes (no regressions)

**Doctorow Gate (Post-Implementation Verification):**
- [ ] Failure test — Intentionally break external dep → graceful failure?
- [ ] Assumption test — Behavior when key assumption wrong?
- [ ] Rollback test — Can disable without breaking other features?
- [ ] Debt recorded — Entry added to debt-ledger.md?

### Completion Requirements (`specflow complete`)

Before a feature can be marked complete, `specflow complete` validates:

1. **Required Files:**
   - `spec.md` - Specification (from SPECIFY phase)
   - `plan.md` - Technical plan (from PLAN phase)
   - `tasks.md` - Task breakdown (from TASKS phase)
   - `docs.md` - Documentation updates
   - `verify.md` - End-to-end verification with actual test results

2. **Test Coverage:**
   - Minimum test file ratio: 0.3 (test files / source files)
   - All tests must pass (`bun test`)

3. **verify.md Validation:**
   - Must contain required sections (Pre-Verification Checklist, Smoke Test Results, Browser Verification, API Verification)
   - Must not contain unfilled placeholders like `[paste actual output]`
   - Proves the feature actually works end-to-end

Use `--force` to bypass validation (not recommended).

---

## Success Criteria: `specflow status`

**The final `specflow status` is the source of truth.**

At project completion:
- ✅ **Success**: `specflow status` shows features at 100% complete
- ❌ **Failure**: `specflow status` shows 0% (you didn't use SpecFlow)

If you implemented code but `specflow status` shows 0%, you failed to use SpecFlow regardless of whether the code works.

---

## Quality Gates (Eval System)

SpecFlow includes automatic quality gates using `specflow eval`:

### Available Rubrics

| Rubric | Phase | Threshold | Location |
|--------|-------|-----------|----------|
| `spec-quality` | SPECIFY | 80% | `evals/rubrics/spec-quality.yaml` |
| `plan-quality` | PLAN | 80% | `evals/rubrics/plan-quality.yaml` |

### spec-quality Rubric
- Acceptance Criteria (40%) - Testable, Given/When/Then format
- Scope Definition (25%) - In/out scope, dependencies
- Error Handling (20%) - Failure scenarios defined
- Technical Clarity (15%) - NFRs, constraints

### plan-quality Rubric
- Spec Traceability (30%) - Every FR/NFR has implementation approach
- Architectural Soundness (25%) - Clear boundaries, follows patterns
- Failure Resilience (20%) - Failure modes, recovery, blast radius
- Implementation Concreteness (15%) - Actual paths, complete models
- Verifiability (10%) - TDD strategy, test mapping

### Running Evals

```bash
specflow eval run                         # Run all evals
specflow eval run --rubric spec-quality   # Run specific rubric
specflow eval list                        # List test cases
specflow eval history                     # Show past eval runs
```

---

## pai-deps Integration

For projects registered with `pai-deps`, use these commands to get dependency context and failure analysis. This integration helps populate critical sections in spec.md and plan.md.

### During SPECIFY Phase

Before writing spec.md, get system context:

```bash
pai-deps speckit context <tool-name>
```

This outputs:
- Upstream dependencies (what this tool depends on)
- Downstream dependencies (what depends on this tool)
- Integration points and contracts

**Use output to populate the "System Context" section in spec.md.**

### During PLAN Phase

Before writing plan.md, get failure modes:

```bash
pai-deps speckit failures <tool-name>
```

This outputs:
- How changes might break dependent tools
- Blast radius analysis
- Failure propagation paths

**Use output to populate the "Failure Mode Analysis" section in plan.md.**

### When to Use

| Situation | Command |
|-----------|---------|
| New tool/feature in PAI ecosystem | Both commands |
| Modifying existing registered tool | Both commands |
| Standalone project (not in pai-deps) | Skip - not applicable |

### Example Workflow

```bash
# 1. Check if tool is registered
pai-deps show my-tool

# 2. Before SPECIFY phase
pai-deps speckit context my-tool > /tmp/context.md
# Review and incorporate into spec.md System Context section

# 3. Before PLAN phase
pai-deps speckit failures my-tool > /tmp/failures.md
# Review and incorporate into plan.md Failure Mode Analysis section
```

---

## Directory Structure

```
project-root/
├── .specflow/
│   └── features.db           # Feature queue (SQLite)
├── .specify/
│   ├── memory/
│   │   └── constitution.md   # Project-specific principles
│   ├── debt-ledger.md        # Technical debt tracking
│   └── specs/
│       └── F-N-<feature-name>/   # e.g., F-1-user-auth/
│           ├── spec.md       # Phase 1: Specification
│           ├── plan.md       # Phase 2: Technical Plan
│           ├── tasks.md      # Phase 3: Implementation Tasks
│           ├── docs.md       # Phase 4: Documentation updates
│           ├── verify.md     # Phase 4: End-to-end verification
│           ├── data-model.md # Optional: Complex schemas
│           └── contracts/    # Optional: API specs
└── src/                      # Phase 4: Implementation
```

### Feature ID Format

- **Format**: `F-N` where N is an incrementing number (F-1, F-2, F-35...)
- **Storage**: Project-local SQLite database (`.specflow/features.db`)
- **No global registry**: Each project manages its own feature queue

---

## Constitutional Inheritance

```
PAI CORE CONSTITUTION.md (Master - cannot be overridden)
         |
         v (inherits, cannot override)
.specify/memory/constitution.md (Project-specific constraints)
```

Project constitutions can ADD constraints but cannot REMOVE PAI principles.

---

## Feature Granularity Rules (CRITICAL)

Projects must be decomposed into **5-15 features**. This is enforced by `specflow init`.

### Hard Limits

- **Minimum:** 3 features (hard floor - if simpler, you don't need SpecFlow)
- **Default minimum:** 5 features
- **Default maximum:** 15 features

### Granularity Guidelines

Each feature should be:
- **Completable in 1-4 hours** of focused work
- **Independently testable** with its own test file
- **User-visible capability**, not an internal module

### Example: Wrong vs Right

**BAD** (too coarse - this is ONE feature for a complex project):
```
F-1: Domain Security Scanner
```

**GOOD** (properly decomposed):
```
F-1: Domain input validation
F-2: SSL/TLS certificate scanner
F-3: HTTP security headers scanner
F-4: DNS configuration scanner
F-5: Port scanner
F-6: Grading engine
F-7: REST API endpoint
F-8: Web dashboard UI
```

### Why This Matters

- Each feature gets its own spec, plan, tasks, and tests
- Smaller features are easier to test thoroughly
- Progress is visible and measurable
- Failures are isolated to specific features

---

## When to Use SpecFlow

**ALWAYS use SpecFlow for:**
- Any NEW FEATURE (command, capability, integration)
- Multi-file changes that add functionality
- User says: "add", "implement", "create", "build" + feature description

**DO NOT use SpecFlow for:**
- Bug fixes (just fix them)
- Single-file tweaks
- Config changes
- Documentation updates

---

## Handling Time Pressure

If the user mentions time constraints ("one day", "quick demo", "MVP"):

**DO NOT** silently skip SpecFlow phases.

**DO** ask explicitly:

```
"You've asked to use SpecFlow, but mentioned this needs to be done quickly.
SpecFlow requires full spec/plan/tasks for each feature. Options:

1. **Full SpecFlow (recommended)**: Complete workflow for 2-3 features instead of 8
2. **Skip SpecFlow**: I'll code directly without specs (not spec-driven)
3. **Hybrid**: Full specs for core features, lighter process for others

Which approach would you prefer?"
```

Let the user decide. Never assume.

---

## How to Start

**For NEW features:**
```bash
specflow add "feature-name" "Feature description"
specflow specify F-1   # Creates spec.md
specflow plan F-1      # Creates plan.md
specflow tasks F-1     # Creates tasks.md, then implement
specflow complete F-1  # Mark done after implementation
```

**For existing F-N features:**
```bash
specflow status        # See current phase
# Continue from current phase
```

---

## Detection Triggers

Load this skill when:
- User mentions "F-1", "F-2", "F-XXX" pattern
- Project has `.specify/` directory
- Project has `.specflow/` directory
- User requests ANY new feature (add, implement, create, build)
- User says "spec", "specify", "specflow", "plan feature", "new feature"

---

## Templates

SpecFlow includes templates for all artifacts in `templates/`:
- `constitution.md` - Project-specific principles
- `spec.md` - Specification template
- `plan.md` - Technical plan template
- `tasks.md` - Task breakdown template (with TDD enforcement)
- `verify.md` - End-to-end verification template
- `debt-ledger.md` - Technical debt tracking

Workflow documentation in `workflows/`:
- `sdd-workflow.md` - Complete SDD process guide
- `specify-with-interview.md` - Interview protocol

---

## References

- [GitHub spec-kit](https://github.com/github/spec-kit)
- [Spec-Driven Methodology](https://github.com/github/spec-kit/blob/main/spec-driven.md)
- PAI CONSTITUTION.md - Master principles
- PAI TESTING.md override - TDD requirements
