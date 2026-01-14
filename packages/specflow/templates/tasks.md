---
feature: "[FEATURE_NAME]"
plan: "./plan.md"
status: "pending"
total_tasks: [N]
completed: 0
---

# Tasks: [FEATURE_NAME]

## Legend

- `[T]` - Test required (TDD mandatory - write test FIRST)
- `[P]` - Can run in parallel with other [P] tasks in same group
- `depends: T-X.Y` - Must complete after specified task(s)

## Task Groups

### Group 1: Foundation

- [ ] **T-1.1** Create database schema [T] [P]
  - File: `src/db/schema.ts`
  - Test: `tests/unit/schema.test.ts`
  - Description: [What this task accomplishes]

- [ ] **T-1.2** Create TypeScript types [T] [P]
  - File: `src/types.ts`
  - Test: `tests/unit/types.test.ts`
  - Description: [What this task accomplishes]

### Group 2: Core Implementation

- [ ] **T-2.1** Implement service layer [T] (depends: T-1.1, T-1.2)
  - File: `src/services/[feature].ts`
  - Test: `tests/unit/[feature].test.ts`
  - Description: [What this task accomplishes]

- [ ] **T-2.2** Implement CLI command [T] (depends: T-2.1)
  - File: `src/commands/[feature].ts`
  - Test: `tests/e2e/[feature].test.ts`
  - Description: [What this task accomplishes]

### Group 3: Integration

- [ ] **T-3.1** Wire into main CLI [T] (depends: T-2.2)
  - File: `src/index.ts`
  - Test: `tests/e2e/cli.test.ts`
  - Description: [What this task accomplishes]

- [ ] **T-3.2** Update documentation (depends: T-3.1)
  - Files: `README.md`, `CLAUDE.md`
  - Description: Document new feature and commands

## Dependency Graph

```
T-1.1 ──┬──> T-2.1 ──> T-2.2 ──> T-3.1 ──> T-3.2
T-1.2 ──┘
```

## Execution Order

1. **Parallel batch 1:** T-1.1, T-1.2
2. **Sequential:** T-2.1 (after batch 1 complete)
3. **Sequential:** T-2.2 (after T-2.1)
4. **Sequential:** T-3.1 (after T-2.2)
5. **Sequential:** T-3.2 (after T-3.1)

## Progress Tracking

| Task | Status | Started | Completed | Notes |
|------|--------|---------|-----------|-------|
| T-1.1 | pending | - | - | |
| T-1.2 | pending | - | - | |
| T-2.1 | pending | - | - | |
| T-2.2 | pending | - | - | |
| T-3.1 | pending | - | - | |
| T-3.2 | pending | - | - | |

## TDD Enforcement (MANDATORY)

**CRITICAL:** Every task marked [T] MUST follow the RED-GREEN-BLUE cycle. This is not optional.

### The TDD Cycle

For each task marked [T]:

1. **RED:** Write failing test FIRST
   - The test must fail before implementation
   - Run `bun test` to verify it fails
   - If the test passes without implementation, the test is wrong

2. **GREEN:** Write MINIMAL implementation to pass
   - Only write enough code to make the test pass
   - Do not add extra features or "nice to haves"
   - Run `bun test` to verify it passes

3. **BLUE:** Refactor while keeping tests green
   - Clean up code, remove duplication
   - Run `bun test` after each change
   - Tests must stay green throughout

4. **VERIFY:** Run full test suite (`bun test`)
   - ALL tests must pass, not just the new one
   - Check for regressions

### Test Coverage Requirements

- **Minimum ratio:** 0.3 (test files / source files)
- **Every source file** should have a corresponding test file
- **specflow complete** will REJECT features with insufficient coverage

### DO NOT Proceed Until:

- [ ] Test written BEFORE implementation (RED phase completed)
- [ ] Current task's tests pass (GREEN phase completed)
- [ ] Full test suite passes (no regressions)
- [ ] Test file ratio meets minimum (0.3)

### Common TDD Violations (AVOID)

- Writing implementation first, then tests (this is not TDD)
- Writing tests that pass immediately (test is meaningless)
- Skipping tests for "simple" code (all code needs tests)
- Moving to next task before current tests pass

## Blockers & Issues

[Track any blockers discovered during implementation]

| Task | Issue | Resolution |
|------|-------|------------|
| - | - | - |

## Post-Implementation Verification

**Before marking feature complete, verify:**

### Functional Verification
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Feature works as specified in acceptance criteria

### Failure Verification (Doctorow Gate)
- [ ] **Failure test:** Intentionally broke an external dependency → system failed gracefully
- [ ] **Assumption test:** Verified behavior when key assumption is wrong
- [ ] **Rollback test:** Feature can be disabled without breaking other features
- [ ] **Error messages:** Failures produce actionable error messages

### Maintainability Verification
- [ ] **Documentation test:** Someone new could understand why this code exists
- [ ] **Debt recorded:** Added entry to project debt-ledger.md
- [ ] **No orphan code:** All new code is reachable and tested

### Sign-off
- [ ] All verification items checked
- [ ] Debt score calculated and recorded
- Date completed: ___
