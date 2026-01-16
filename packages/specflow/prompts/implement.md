# Feature Implementation

## Context & Motivation

TDD (Test-Driven Development) ensures each code change is validated before moving forward, catching bugs at the moment of introduction rather than in production. The Doctorow Gate—named after Cory Doctorow's principle that "code is a liability, not an asset"—verifies that features fail gracefully. Features passing both TDD and Doctorow Gate show 73% fewer post-release defects in production systems.

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

## Instructions

Implement this feature using Test-Driven Development, then verify it passes the Doctorow Gate.

### TDD Cycle

Follow this cycle for each implementation unit:

1. **Write failing test** — Define expected behavior before writing code
2. **Confirm failure** — Run test to verify it fails meaningfully (not due to syntax error)
3. **Write minimal implementation** — Just enough code to pass the test
4. **Confirm pass** — Run test to verify implementation works
5. **Refactor** — Clean up while keeping tests green
6. **Run full suite** — Ensure no regressions introduced

### Example TDD Flow

```typescript
// Step 1: Write failing test
describe('calculateTax', () => {
  it('returns 0 for exempt items', () => {
    const result = calculateTax({ exempt: true, amount: 100 });
    expect(result).toBe(0);
  });

  it('applies 10% tax for standard items', () => {
    const result = calculateTax({ exempt: false, amount: 100 });
    expect(result).toBe(10);
  });
});

// Step 2: Run → FAIL (function doesn't exist)
// ✗ ReferenceError: calculateTax is not defined

// Step 3: Write minimal implementation
export function calculateTax(item: { exempt: boolean; amount: number }): number {
  if (item.exempt) return 0;
  return item.amount * 0.1;
}

// Step 4: Run → PASS
// ✓ returns 0 for exempt items
// ✓ applies 10% tax for standard items

// Step 5: Refactor (extract tax rate constant)
const TAX_RATE = 0.1;
export function calculateTax(item: { exempt: boolean; amount: number }): number {
  return item.exempt ? 0 : item.amount * TAX_RATE;
}

// Step 6: Run full suite → All tests passing
```

### Scope Guidelines

Keep implementation focused on this feature:
- Implement functionality described in the specification
- Follow existing code patterns in the project
- Use TypeScript with strict mode
- Add JSDoc for public functions
- Handle errors with clear, actionable messages

### Quality Standards

| Standard | Requirement |
|----------|-------------|
| Type safety | TypeScript strict mode, no `any` types |
| Documentation | JSDoc for exported functions |
| Error handling | Specific error types, actionable messages |
| Code style | Match existing project conventions |

## Doctorow Gate

> "Code is a liability, not an asset. Make sure it fails well."

Before marking complete, verify the feature handles failure gracefully.

### Failure Verification

| Test | Question | How to Verify |
|------|----------|---------------|
| **Failure test** | Does it fail gracefully? | Break an external dependency → Check for actionable error message |
| **Assumption test** | What if assumptions are wrong? | Send unexpected input (wrong format, null, empty) → Check for clear error |
| **Rollback test** | Can it be disabled safely? | Comment out the feature → Other features still work |

### Example Doctorow Gate Verification

```typescript
// Failure test: What happens when API is down?
describe('Doctorow Gate: fetchUserData', () => {
  it('returns clear error when API unavailable', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const result = await fetchUserData('user-123');

    expect(result.error).toBe('Unable to fetch user data. Check network connection.');
    expect(result.data).toBeNull();
    // ✓ Graceful failure with actionable message
  });

  it('handles unexpected API response format', async () => {
    mockFetch.mockResolvedValue({ unexpected: 'format' });

    const result = await fetchUserData('user-123');

    expect(result.error).toBe('Invalid response format from user API.');
    // ✓ Assumption test passed
  });
});
```

### Debt Score Calculation

Calculate technical debt introduced by this feature:

| Factor | Points |
|--------|--------|
| Base complexity | 1-5 |
| External API dependency | +2 per API |
| Shared mutable state | +3 |
| Security surface (auth, crypto, user input) | +5 |
| Database schema changes | +3 |

Record the debt score in `.specify/debt-ledger.md`.

## Output Format

### On Success

```
[FEATURE COMPLETE]
Feature: {{FEATURE_ID}} - {{FEATURE_NAME}}
Tests: X passing
Files: list of files created/modified
Doctorow Gate: PASSED
  - Failure test: ✓ [scenario tested] → [result observed]
  - Assumption test: ✓ [scenario tested] → [result observed]
  - Rollback test: ✓ [verification method] → [result observed]
  - Debt score: X (breakdown: base N + external deps N + ...)
  - Debt recorded: ✓ Added to .specify/debt-ledger.md
```

### On Blocker

```
[FEATURE BLOCKED]
Feature: {{FEATURE_ID}} - {{FEATURE_NAME}}
Reason: explanation of what's blocking
Suggestion: how to resolve
```

### On Doctorow Gate Failure

```
[DOCTOROW GATE FAILED]
Feature: {{FEATURE_ID}} - {{FEATURE_NAME}}
Failed Check: [failure test | assumption test | rollback test]
Reason: explanation of what failed
Fix Required: specific action to make the code fail gracefully
```

## Completion Criteria

**Success indicators:**
- All tests pass (unit, integration if applicable)
- Feature works as described in specification
- No TypeScript errors in strict mode
- Code follows project conventions
- Doctorow Gate passed (all three verifications)
- Debt score recorded

**Blocked indicators:**
- Missing dependency or unclear requirement
- External system unavailable
- Specification ambiguity requiring clarification

**Gate failure indicators:**
- Feature crashes on dependency failure (instead of graceful error)
- Unexpected input causes unhandled exception
- Disabling feature breaks unrelated functionality

Fix Doctorow Gate failures before marking feature complete. Graceful failure handling is a requirement, not optional.
