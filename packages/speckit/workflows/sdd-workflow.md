# Spec-Driven Development Workflow

**Version**: 1.0
**Last Updated**: 2025-12-18
**Based on**: [GitHub spec-kit](https://github.com/github/spec-kit)

## Overview

Spec-Driven Development (SDD) inverts traditional development: specifications become executable artifacts that directly generate implementations.

```
SPECIFY -> PLAN -> TASKS -> IMPLEMENT -> VERIFY
   |         |        |         |           |
 What/Why   How    Work Items  Code (TDD)  Doctorow Gate
```

### The Doctorow Principle

> "Code is a liability, not an asset."

Every feature adds maintenance burden. SDD explicitly tracks this through:
- **Failure Mode Analysis** in PLAN phase
- **System Context** in SPECIFY phase
- **Debt Ledger** at project level
- **Doctorow Gate** after IMPLEMENT

## Workflow Phases

### Phase 1: Specify (`/speckit.specify`)

**Goal**: Define WHAT and WHY, explicitly avoiding HOW.

**Trigger**: User says "new feature", "spec out", "create spec", "specify"

**Actions**:
1. **Assign Spec ID**:
   - Read `~/.claude/skills/SpecKit/spec-registry.json`
   - Get `lastId`, increment by 1
   - Format as 3-digit string (e.g., 74 → "074")
2. Create `.specify/specs/<ID>-<feature-name>/` directory
3. Add entry to spec-registry.json with new ID
4. Update `lastId` in registry
5. Generate `spec.md` from template
6. Include:
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

**Quality Gates**:
- All scenarios have acceptance criteria
- Requirements are testable
- Success criteria are measurable
- Ambiguities are marked
- Scope is clear
- **System context documented** (upstream, downstream, adjacent)
- **Assumptions have invalidation conditions**
- **Failure behavior specified** in NFRs

**Exit**: User approves specification

### Phase 2: Plan (`/speckit.plan`)

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

**Constitutional Compliance Checklist**:
- [ ] CLI-First: Exposes command-line interface
- [ ] Library-First: Core logic as reusable module
- [ ] Test-First: TDD strategy defined
- [ ] Deterministic: Avoids probabilistic behavior
- [ ] Code Before Prompts: Logic in code, not prompts

**Exit**: User approves technical plan

### Phase 3: Tasks (`/speckit.tasks`)

**Goal**: Break plan into reviewable implementation units.

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

**Exit**: User reviews task breakdown

### Phase 4: Implement (`/speckit.implement`)

**Goal**: Execute tasks with TDD enforcement.

**Trigger**: After tasks reviewed, or "implement", "build from spec"

**Actions**:
For each task marked `[T]`:

1. **RED**: Write failing test first
   ```bash
   bun test path/to/test.ts
   # Verify: Test fails
   ```

2. **GREEN**: Write minimal implementation
   ```bash
   bun test path/to/test.ts
   # Verify: Test passes
   ```

3. **FULL SUITE**: Run all tests
   ```bash
   bun test
   # Verify: ALL tests pass (no regressions)
   ```

4. **BLUE**: Refactor (optional)
   - Keep tests green
   - Improve code quality

5. Update task status in `tasks.md`

6. **VERIFY** (Doctorow Gate):
   - [ ] Failure test: Intentionally break external dep → graceful failure?
   - [ ] Assumption test: Behavior when key assumption wrong?
   - [ ] Rollback test: Can disable without breaking other features?
   - [ ] Debt recorded: Entry added to `.specify/debt-ledger.md`?

**Exit**: All tasks complete, full test suite passes, Doctorow Gate passed

## Directory Structure

```
project-root/
├── .specify/
│   ├── memory/
│   │   └── constitution.md    # Project-specific principles
│   ├── debt-ledger.md         # Technical debt tracking (project-wide)
│   └── specs/
│       └── <ID>-<feature-name>/   # e.g., 074-user-auth/
│           ├── spec.md        # Phase 1: Specification
│           ├── plan.md        # Phase 2: Technical Plan
│           ├── data-model.md  # Optional: Complex schemas
│           ├── contracts/     # Optional: API specs
│           └── tasks.md       # Phase 3: Implementation Tasks
└── src/                       # Phase 4: Implementation
```

**Spec ID Assignment**:
- Registry: `~/.claude/skills/SpecKit/spec-registry.json`
- Format: 3-digit zero-padded (001, 002, ... 074)
- Example: `lastId: 73` → next spec gets ID "074"

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
mv .specify/specs/feature-name/ ${PAI_DIR}/history/specs/
```

## Quick Reference

| Phase | Command | Output | Gate |
|-------|---------|--------|------|
| Specify | `/speckit.specify <desc>` | spec.md | User approval |
| Plan | `/speckit.plan <constraints>` | plan.md | User approval |
| Tasks | `/speckit.tasks` | tasks.md | User review |
| Implement | `/speckit.implement` | Code + Tests | Tests pass |

## When NOT to Use SDD

- Simple bug fixes (just fix it)
- Single-line changes
- Exploratory spikes (prototype first, spec later)
- Documentation-only changes
- Urgent hotfixes

## Example Session

```
User: I want to add RSS feed discovery to ragent

Claude: /speckit.specify RSS feed auto-discovery that finds related feeds

# Creates .specify/specs/rss-discovery/spec.md
# User reviews scenarios and requirements
# User approves spec

Claude: /speckit.plan TypeScript, Bun, SQLite, existing ragent patterns

# Creates plan.md with architecture
# User reviews technical decisions
# User approves plan

Claude: /speckit.tasks

# Creates tasks.md with T-1.1, T-1.2, etc.
# Shows dependencies and parallel opportunities
# User reviews breakdown

Claude: /speckit.implement

# Executes T-1.1 with TDD
# Writes test, verifies fail
# Writes implementation, verifies pass
# Runs full suite, all green
# Proceeds to T-1.2...
```

## References

- [GitHub spec-kit Repository](https://github.com/github/spec-kit)
- [Spec-Driven Methodology](https://github.com/github/spec-kit/blob/main/spec-driven.md)
- [GitHub Blog: SDD with AI](https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/)
- PAI CONSTITUTION.md
- PAI TESTING.md override
