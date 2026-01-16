---
project: "[PROJECT_NAME]"
created: "[DATE]"
inherits: "PAI CORE CONSTITUTION"
quality-thresholds:
  spec-quality: 80
  plan-quality: 80
  quick-start-quality: 60
autoChain: prompt
---

# Project Constitution: [PROJECT_NAME]

This constitution defines the non-negotiable principles for this project. It INHERITS from and CANNOT OVERRIDE the PAI CORE Constitution.

## Inherited Principles (from PAI CORE)

These are automatically enforced and cannot be changed:

1. **CLI-First Architecture** - Every feature exposes CLI interface
2. **Code Before Prompts** - Deterministic code over probabilistic prompts
3. **Test-First Development** - TDD is mandatory, not optional
4. **TypeScript Primary** - Bun runtime, TypeScript language
5. **Deterministic Over Probabilistic** - Predictable, repeatable outcomes

## Project-Specific Principles

### Article I: [Domain-Specific Principle]

[Description of principle specific to this project]

**Enforcement:** [How violations are detected/prevented]

### Article II: [Architecture Constraint]

[Specific architectural constraint for this project]

**Enforcement:** [How violations are detected/prevented]

### Article III: [Quality Gate]

[Specific quality requirement]

**Enforcement:** [How violations are detected/prevented]

## Technology Constraints

| Category | Allowed | Forbidden |
|----------|---------|-----------|
| Database | [e.g., SQLite, PostgreSQL] | [e.g., MongoDB] |
| HTTP Client | [e.g., fetch, axios] | [e.g., request] |
| Testing | [e.g., bun:test] | [e.g., jest] |
| [other] | [allowed] | [forbidden] |

## Integration Requirements

- [ ] [Required integration 1]
- [ ] [Required integration 2]

## Security Requirements

- [ ] [Security requirement 1]
- [ ] [Security requirement 2]

## Performance Requirements

- [ ] [Performance SLA 1]
- [ ] [Performance SLA 2]

## Complexity Tracking

When constitutional principles must be bent (requires explicit justification):

| Principle | Violation | Justification | Approved By |
|-----------|-----------|---------------|-------------|
| - | - | - | - |

## Pre-Implementation Gates

Before ANY implementation begins, verify:

- [ ] Specification exists and is approved
- [ ] Technical plan aligns with this constitution
- [ ] All [NEEDS CLARIFICATION] items resolved
- [ ] Test strategy defined

## Review Triggers

This constitution should be reviewed when:

- Major feature is added
- External dependency is introduced
- Performance requirements change
- Security posture changes
