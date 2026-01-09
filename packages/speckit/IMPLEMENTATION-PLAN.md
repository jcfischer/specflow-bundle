# SpecKit Integration Plan for PAI CORE

**Created**: 2025-12-18
**Status**: Implementation Complete
**Completed**: 2025-12-18
**Source**: Research on [GitHub spec-kit](https://github.com/github/spec-kit)

## Overview

This plan integrates GitHub's Spec-Driven Development methodology into PAI CORE without the Python CLI dependency. Claude Code executes workflows directly via skills and slash commands.

## Research Summary

### What is SpecKit?

GitHub's open-source toolkit (MIT, 16K+ stars, Sept 2025) for Spec-Driven Development:
- Specifications become executable artifacts
- Four gated phases: Specify -> Plan -> Tasks -> Implement
- Constitutional governance per project
- Agent-agnostic (works with Claude Code, Copilot, Gemini)

### Why NOT Install Python CLI?

1. PAI is TypeScript-first (constitution violation)
2. Claude Code can execute workflows directly
3. Simpler maintenance via markdown templates
4. Avoids Python 3.11+ dependency

## Implementation Checklist

### Phase 1: Templates (Priority: High) - COMPLETE

- [x] `templates/spec.md` - Specification template
- [x] `templates/plan.md` - Technical planning template
- [x] `templates/tasks.md` - Task breakdown template
- [x] `templates/constitution.md` - Project constitution template

### Phase 2: Slash Commands (Priority: High) - COMPLETE

- [x] `~/.claude/commands/speckit.specify.md`
- [x] `~/.claude/commands/speckit.plan.md`
- [x] `~/.claude/commands/speckit.tasks.md`
- [x] `~/.claude/commands/speckit.implement.md`
- [ ] `~/.claude/commands/speckit.clarify.md` (optional - deferred)
- [ ] `~/.claude/commands/speckit.analyze.md` (optional - deferred)

### Phase 3: Workflow Documentation (Priority: Medium) - COMPLETE

- [x] `workflows/sdd-workflow.md` - Complete SDD process guide
- [x] Integration with existing TDD workflow (via /speckit.implement)

### Phase 4: CORE Integration (Priority: Medium) - COMPLETE

- [x] Update `~/.claude/skills/CORE/SKILL.md` routing table
- [x] Add SDD triggers to workflow routing
- [x] Add Example 3 demonstrating SDD workflow

### Phase 5: Project Scaffolding (Priority: Low) - COMPLETE

- [ ] Script to initialize `.specify/` directory in projects (DEFERRED - Claude Code creates directories automatically)
- [x] Auto-numbering for feature specs (001-, 002-, etc.) - Implemented 2025-12-19

#### Auto-numbering Implementation

**Registry CLI** (`src/index.ts`):
- `registry list` - List all specs with IDs, skill, status
- `registry assign` - Assign new ID to a spec
- `registry next` - Get next available ID
- `registry show <id>` - Show spec details

**Registry File** (`spec-registry.json`):
- Central registry tracking all specs with IDs
- 5 existing specs numbered 001-005

**Integration**:
- `/speckit.specify` command updated to auto-assign IDs
- Template updated with `id` field in frontmatter

## File Contents to Create

### 1. templates/spec.md

```markdown
---
feature: "[FEATURE_NAME]"
status: "draft"
created: "[DATE]"
---

# Specification: [FEATURE_NAME]

## Overview

[High-level summary of what this feature does and why it matters]

## User Scenarios

### Scenario 1: [Primary Use Case]

**As a** [user type]
**I want to** [action]
**So that** [benefit]

**Acceptance Criteria:**
- [ ] [Testable criterion 1]
- [ ] [Testable criterion 2]

### Scenario 2: [Secondary Use Case]

[Repeat format]

## Functional Requirements

### FR-1: [Requirement Name]

[Description of what the system must do]

**Validation:** [How to verify this works]

### FR-2: [Requirement Name]

[Repeat format]

## Non-Functional Requirements

- **Performance:** [Response time, throughput expectations]
- **Security:** [Authentication, authorization needs]
- **Scalability:** [Expected load, growth patterns]

## Key Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| [Name] | [What it is] | [Important fields] |

## Success Criteria

- [ ] [Measurable outcome 1]
- [ ] [Measurable outcome 2]
- [ ] [Measurable outcome 3]

## Assumptions

- [Assumption 1]
- [Assumption 2]

## [NEEDS CLARIFICATION]

- [Ambiguous area 1]
- [Ambiguous area 2]

## Out of Scope

- [Explicitly excluded item 1]
- [Explicitly excluded item 2]
```

### 2. templates/plan.md

```markdown
---
feature: "[FEATURE_NAME]"
spec: "./spec.md"
status: "draft"
---

# Technical Plan: [FEATURE_NAME]

## Architecture Overview

[High-level description of how this will be built]

```
[ASCII diagram of components]
```

## Technology Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Language | TypeScript | PAI standard |
| Runtime | Bun | PAI standard |
| Database | [choice] | [why] |
| [other] | [choice] | [why] |

## Constitutional Compliance

- [x] CLI-First: [How this exposes CLI interface]
- [x] Library-First: [Core logic as reusable module]
- [x] Test-First: [Testing strategy]
- [x] Deterministic: [How this avoids probabilistic behavior]

## Data Model

See: `data-model.md`

## API Contracts

See: `contracts/`

## Implementation Strategy

### Phase 1: Foundation

[What gets built first and why]

### Phase 2: Core Features

[Main functionality]

### Phase 3: Integration

[How it connects to existing system]

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| [Risk 1] | [High/Med/Low] | [Strategy] |

## Dependencies

- [External dependency 1]
- [Existing internal module]

## Estimated Complexity

- **New files:** ~[N]
- **Modified files:** ~[N]
- **Test files:** ~[N]
```

### 3. templates/tasks.md

```markdown
---
feature: "[FEATURE_NAME]"
plan: "./plan.md"
status: "pending"
---

# Tasks: [FEATURE_NAME]

## Legend

- `[T]` - Test required (TDD mandatory)
- `[P]` - Can run in parallel with other [P] tasks
- `depends: T-X.Y` - Must complete after specified task

## Task Groups

### Group 1: Foundation

- [ ] **T-1.1** Create database schema [T] [P]
  - File: `src/db/schema.ts`
  - Test: `tests/unit/schema.test.ts`

- [ ] **T-1.2** Create TypeScript types [T] [P]
  - File: `src/types.ts`
  - Test: `tests/unit/types.test.ts`

### Group 2: Core Implementation

- [ ] **T-2.1** Implement service layer [T] (depends: T-1.1, T-1.2)
  - File: `src/services/[feature].ts`
  - Test: `tests/unit/[feature].test.ts`

- [ ] **T-2.2** Implement CLI command [T] (depends: T-2.1)
  - File: `src/commands/[feature].ts`
  - Test: `tests/e2e/[feature].test.ts`

### Group 3: Integration

- [ ] **T-3.1** Wire into main CLI [T] (depends: T-2.2)
  - File: `src/index.ts`
  - Test: `tests/e2e/cli.test.ts`

- [ ] **T-3.2** Update documentation (depends: T-3.1)
  - File: `README.md`, `CLAUDE.md`

## Execution Order

```
T-1.1 ─┬─> T-2.1 ─> T-2.2 ─> T-3.1 ─> T-3.2
T-1.2 ─┘
```

## Progress Tracking

| Task | Status | Started | Completed |
|------|--------|---------|-----------|
| T-1.1 | pending | - | - |
| T-1.2 | pending | - | - |
| T-2.1 | pending | - | - |
| T-2.2 | pending | - | - |
| T-3.1 | pending | - | - |
| T-3.2 | pending | - | - |
```

### 4. Slash Command: speckit.specify.md

```markdown
# Spec-Driven Development: Specify Phase

You are creating a feature specification using the SpecKit methodology.

## Instructions

1. **Create directory structure:**
   ```
   .specify/specs/<feature-name>/
   ```

2. **Read the spec template:**
   ```
   ~/.claude/skills/SpecKit/templates/spec.md
   ```

3. **Generate spec.md** by filling the template with:
   - Feature name from user input
   - User scenarios (primary and secondary)
   - Functional requirements
   - Key entities
   - Success criteria
   - Mark unclear areas with `[NEEDS CLARIFICATION]`

4. **DO NOT include:**
   - Technology choices
   - Implementation details
   - Architecture decisions
   - Code samples

5. **Present the spec** for user review and approval.

6. **Only after approval**, proceed to `/speckit.plan`

## Quality Gates

- [ ] All user scenarios have acceptance criteria
- [ ] Requirements are testable
- [ ] Success criteria are measurable
- [ ] Ambiguities are marked, not assumed
- [ ] Scope boundaries are clear
```

## CORE Integration

Add to `~/.claude/skills/CORE/SKILL.md` workflow routing:

```markdown
| Action | Trigger | Behavior |
|--------|---------|----------|
| **SDD: Specify** | "new feature", "spec out", "create spec", "specify" | Invoke SpecKit skill, run `/speckit.specify` |
| **SDD: Plan** | "plan this", "technical design", "architecture" | `/speckit.plan` |
| **SDD: Tasks** | "break down", "create tasks", "task list" | `/speckit.tasks` |
| **SDD: Implement** | "implement spec", "build from spec" | `/speckit.implement` with TDD |
```

## Testing the Integration

After implementation, test with:

```bash
# In any project directory
claude

# Test specify phase
/speckit.specify "Add user authentication with OAuth2"

# Verify: .specify/specs/user-authentication/spec.md created
# Verify: No implementation details in spec
# Verify: [NEEDS CLARIFICATION] markers present

# Test plan phase (after spec approval)
/speckit.plan "TypeScript, Bun, SQLite, existing auth patterns"

# Verify: plan.md, data-model.md created
# Verify: Constitutional compliance checked

# Test tasks phase
/speckit.tasks

# Verify: tasks.md with T-X.Y format
# Verify: [T] markers on code tasks
# Verify: Dependencies mapped

# Test implement phase
/speckit.implement

# Verify: TDD workflow triggered
# Verify: Tests written before code
# Verify: Full test suite runs
```

## References

- [GitHub spec-kit](https://github.com/github/spec-kit)
- [GitHub Blog: Spec-Driven Development](https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/)
- [Spec-Driven Methodology](https://github.com/github/spec-kit/blob/main/spec-driven.md)
- [Microsoft Developer Blog](https://developer.microsoft.com/blog/spec-driven-development-spec-kit)
