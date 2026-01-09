# Feature Implementation Prompt

You are implementing a single feature for an application. Focus ONLY on this feature.

## Application Context

{{APP_CONTEXT}}

## Feature to Implement

**ID:** {{FEATURE_ID}}
**Name:** {{FEATURE_NAME}}
**Description:** {{FEATURE_DESCRIPTION}}

{{#if FEATURE_SPEC}}
## Detailed Specification

{{FEATURE_SPEC}}
{{/if}}

## Implementation Requirements

### 1. TDD Mandatory

You MUST follow Test-Driven Development:

1. **Write failing test first** - Create test that defines expected behavior
2. **Run test to confirm it fails** - Verify the test is meaningful
3. **Write minimal implementation** - Just enough code to pass the test
4. **Run test to confirm it passes** - Verify implementation works
5. **Refactor if needed** - Clean up while keeping tests green
6. **Run full test suite** - Ensure no regressions

### 2. Scope Discipline

- Implement ONLY this feature, nothing more
- Do not refactor unrelated code
- Do not add "nice to have" functionality
- Do not modify code outside this feature's scope

### 3. Quality Standards

- Use TypeScript with strict mode
- Add JSDoc for public functions
- Handle errors appropriately
- Follow existing code patterns

### 4. Completion Criteria

Before marking complete, verify:

- [ ] All tests pass
- [ ] Feature works as described
- [ ] No TypeScript errors
- [ ] Code follows project conventions

### 5. Doctorow Gate (Post-Implementation Verification)

> "Code is a liability, not an asset. Make sure it fails well."

Before marking feature complete, you MUST verify:

**Failure Verification:**
- [ ] **Failure test:** Intentionally break an external dependency → Does the system fail gracefully with actionable error messages?
- [ ] **Assumption test:** What happens if a key assumption is wrong? (e.g., API returns unexpected format)
- [ ] **Rollback test:** Can this feature be disabled without breaking other features?

**Maintainability Verification:**
- [ ] **Documentation:** Could someone new understand why this code exists?
- [ ] **Debt recorded:** Calculate debt score and add entry to `.specify/debt-ledger.md`

**Debt Score Calculation:**
- Base complexity: 1-5
- External dependencies: +2 per API
- Shared state: +3
- Security surface: +5
- Schema changes: +3

## Output

When you have successfully implemented the feature and all tests pass, output:

```
[FEATURE COMPLETE]
Feature: {{FEATURE_ID}} - {{FEATURE_NAME}}
Tests: X passing
Files: list of files created/modified
Doctorow Gate: PASSED
  - Failure test: ✓ [what you tested and result]
  - Assumption test: ✓ [what you tested and result]
  - Rollback test: ✓ [what you tested and result]
  - Debt score: X (breakdown: base N + external deps N + ...)
  - Debt recorded: ✓ Added to .specify/debt-ledger.md
```

If you encounter a blocker that prevents completion, output:

```
[FEATURE BLOCKED]
Feature: {{FEATURE_ID}} - {{FEATURE_NAME}}
Reason: explanation of what's blocking
Suggestion: how to resolve
```

If the Doctorow Gate fails, output:

```
[DOCTOROW GATE FAILED]
Feature: {{FEATURE_ID}} - {{FEATURE_NAME}}
Failed Check: [failure test | assumption test | rollback test]
Reason: explanation of what failed
Fix Required: specific action to make the code fail gracefully
```

**Important:** Do NOT mark the feature complete until the Doctorow Gate passes. Fix the failure mode first.
