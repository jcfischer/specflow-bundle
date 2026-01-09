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

- [ ] **CLI-First:** [How this exposes CLI interface]
- [ ] **Library-First:** [Core logic as reusable module]
- [ ] **Test-First:** [Testing strategy]
- [ ] **Deterministic:** [How this avoids probabilistic behavior]
- [ ] **Code Before Prompts:** [What's in code vs prompts]

## Data Model

### Entities

```typescript
// [Entity 1]
interface [EntityName] {
  id: string;
  // ...fields
}
```

### Database Schema

```sql
CREATE TABLE [table_name] (
  id TEXT PRIMARY KEY,
  -- ...columns
);
```

See also: `data-model.md` (if complex)

## API Contracts

### Internal APIs

```typescript
// Function signature template
function functionName(input: InputType): Promise<ReturnType>
```

### External APIs (if any)

See: `contracts/api-spec.json`

## Implementation Strategy

### Phase 1: Foundation

[What gets built first and why]

- [ ] Database schema
- [ ] TypeScript types
- [ ] Base service structure

### Phase 2: Core Features

[Main functionality]

- [ ] Primary business logic
- [ ] CLI commands
- [ ] Error handling

### Phase 3: Integration

[How it connects to existing system]

- [ ] Wire into main entry point
- [ ] Update existing commands if needed
- [ ] Documentation

## File Structure

```
src/
├── db/
│   └── schema.ts        # [New/Modified]
├── services/
│   └── [feature].ts     # [New]
├── commands/
│   └── [feature].ts     # [New]
└── index.ts             # [Modified]

tests/
├── unit/
│   └── [feature].test.ts
└── e2e/
    └── [feature].test.ts
```

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| [Risk 1] | High/Med/Low | High/Med/Low | [Strategy] |

## Failure Mode Analysis

### How This Code Can Fail

| Failure Mode | Trigger | Detection | Degradation | Recovery |
|-------------|---------|-----------|-------------|----------|
| [External API timeout] | Network issues | Circuit breaker | Return cached data | Retry with backoff |
| [Schema mismatch] | Upstream changes | Zod validation | Reject + log | Alert owner |
| [Resource exhaustion] | Scale beyond expected | Memory monitoring | Queue overflow | Graceful shutdown |

### Assumptions That Could Break

| Assumption | What Would Invalidate It | Detection Strategy |
|-----------|-------------------------|-------------------|
| [Key assumption 1] | [Invalidation condition] | [How we detect] |
| [Key assumption 2] | [Invalidation condition] | [How we detect] |

### Blast Radius

- **Files touched:** ~[N] files
- **Systems affected:** [list]
- **Rollback strategy:** [describe]

## Dependencies

### External

- [npm package] - [purpose]

### Internal

- [existing module] - [how it's used]

## Migration/Deployment

[Any special considerations for deploying this feature]

- [ ] Database migrations needed?
- [ ] Environment variables?
- [ ] Breaking changes?

## Estimated Complexity

- **New files:** ~[N]
- **Modified files:** ~[N]
- **Test files:** ~[N]
- **Estimated tasks:** ~[N]
- **Debt score:** [1-5 base + modifiers, see debt-ledger.md]

## Longevity Assessment

### Maintainability Indicators

| Indicator | Status | Notes |
|-----------|--------|-------|
| **Readability:** Can a developer understand this in 6 months? | [Yes/Partial/No] | |
| **Testability:** Can changes be verified without manual testing? | [Yes/No] | |
| **Documentation:** Is the "why" captured, not just the "what"? | [Yes/No] | |

### Evolution Vectors

| What Might Change | Preparation | Impact |
|------------------|-------------|--------|
| API version upgrade | Abstract behind interface | Low |
| Schema evolution | Migration script pattern | Medium |
| Runtime change | Minimize runtime-specific code | Low |
| [Project-specific change] | [Strategy] | [Impact] |

### Deletion Criteria

When should this code be deleted?

- [ ] Feature superseded by: ___
- [ ] Dependency deprecated: ___
- [ ] User need eliminated: ___
- [ ] Maintenance cost exceeds value when: ___
