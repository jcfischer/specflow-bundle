---
name: SpecFlow
description: Multi-agent orchestration for spec-driven development (SDD). Inverts traditional development - specifications become executable artifacts that directly generate implementations. USE WHEN user says "new feature", "spec out", "create spec", "specify", "specflow", or wants structured feature development.
triggers:
  - pattern: "/specflow"
    type: command
    priority: 100
  - pattern: "spec out"
    type: keyword
    priority: 50
  - pattern: "create spec"
    type: keyword
    priority: 50
  - pattern: "new feature"
    type: keyword
    priority: 50
  - pattern: "specflow specify"
    type: keyword
    priority: 50
  - pattern: "spec-driven"
    type: keyword
    priority: 40
---

# SpecFlow - Spec-Driven Development

Multi-agent orchestration for spec-driven development (SDD). Based on GitHub's spec-kit methodology.

## Philosophy

> "Code is a liability, not an asset." - Cory Doctorow

Specifications become executable artifacts that directly generate implementations:

```
SPECIFY -> PLAN -> TASKS+IMPLEMENT -> VERIFY
   |         |           |              |
 What/Why   How    Work Items→Code   Doctorow Gate
                   (auto-chains)
```

## Workflow Phases

### Phase 1: Specify (`specflow specify F-N`)
Define WHAT and WHY, explicitly avoiding HOW.
- Begins with structured interview (8 phases)
- Generates `spec.md` from template
- Quality gate: Must score ≥ 80%

### Phase 2: Plan (`specflow plan F-N`)
Convert specification into technical design.
- Architecture overview
- Technology stack with rationale
- Constitutional compliance check
- Failure mode analysis

### Phase 3: Tasks (`specflow tasks F-N`)
Break plan into implementation units.
- Task groups (Foundation, Core, Integration)
- Dependencies and parallelization markers
- Auto-chains to Phase 4

### Phase 4: Implement (auto-triggered)
Execute tasks with TDD enforcement.
- RED: Write failing test
- GREEN: Write minimal implementation
- FULL SUITE: All tests pass
- Doctorow Gate: Verify failure handling

## Quick Reference

```bash
# Add feature to queue
specflow add "RSS feed discovery"

# Specify feature (with interview)
specflow specify F-1

# Plan feature
specflow plan F-1

# Generate tasks and implement
specflow tasks F-1

# Evaluate spec/plan quality
specflow eval run --file spec.md --suite spec-quality
```

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
│       └── F-N-<feature-name>/
│           ├── spec.md       # Specification
│           ├── plan.md       # Technical Plan
│           └── tasks.md      # Implementation Tasks
```

## References

- [GitHub spec-kit](https://github.com/github/spec-kit)
- [Spec-Driven Development with AI](https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/)
