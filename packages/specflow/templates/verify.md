---
feature: "[FEATURE_NAME]"
feature_id: "[F-N]"
verified_date: "[DATE]"
verified_by: "[AGENT/USER]"
status: "pending"
---

# Verification: [FEATURE_NAME]

This document proves the feature works end-to-end before marking it complete.

## Pre-Verification Checklist

Before running verification, confirm:

- [ ] All tasks in tasks.md are marked complete
- [ ] All unit tests pass (`bun test`)
- [ ] No TypeScript errors (`bun build --dry-run` or `tsc --noEmit`)
- [ ] Feature is deployed/running locally

## Smoke Test Results

### Test 1: [Primary Use Case]

**Command/Action:**
```bash
[paste actual command]
```

**Expected Output:**
[describe what should happen]

**Actual Output:**
```
[paste actual output - DO NOT use placeholders]
```

**Status:** [ ] PASS / [ ] FAIL

### Test 2: [Secondary Use Case]

**Command/Action:**
```bash
[paste actual command]
```

**Expected Output:**
[describe what should happen]

**Actual Output:**
```
[paste actual output - DO NOT use placeholders]
```

**Status:** [ ] PASS / [ ] FAIL

### Test 3: [Error Handling Case]

**Command/Action:**
```bash
[paste actual command that should fail gracefully]
```

**Expected Output:**
[describe expected error message/behavior]

**Actual Output:**
```
[paste actual output - DO NOT use placeholders]
```

**Status:** [ ] PASS / [ ] FAIL

## Browser Verification

If this feature has a UI:

**URL:** [e.g., http://localhost:3000]

**Steps:**
1. [Step 1 - what to do]
2. [Step 2 - what to do]
3. [Step 3 - what to do]

**Expected Behavior:**
[describe what should happen in the UI]

**Actual Behavior:**
[describe what actually happened - be specific]

**Screenshot Evidence:**
[If applicable, note where screenshot was saved or describe what was seen]

**Status:** [ ] PASS / [ ] FAIL / [ ] N/A (no UI)

## API Verification

If this feature has an API:

### Endpoint 1: [METHOD /path]

**Request:**
```bash
curl -X POST http://localhost:3000/api/endpoint \
  -H "Content-Type: application/json" \
  -d '{"key": "value"}'
```

**Expected Response:**
```json
{"status": "success", ...}
```

**Actual Response:**
```json
[paste actual response - DO NOT use placeholders]
```

**Status:** [ ] PASS / [ ] FAIL / [ ] N/A (no API)

## Edge Case Verification

### Invalid Input Handling

**Test:** [describe invalid input test]
**Result:** [describe actual behavior]
**Status:** [ ] PASS / [ ] FAIL

### Boundary Conditions

**Test:** [describe boundary test]
**Result:** [describe actual behavior]
**Status:** [ ] PASS / [ ] FAIL

## Test Coverage Summary

| Metric | Value |
|--------|-------|
| Source files | [N] |
| Test files | [N] |
| Coverage ratio | [N.NN] |
| All tests pass | [ ] YES / [ ] NO |

## Verification Summary

| Category | Status |
|----------|--------|
| Smoke tests | [ ] PASS / [ ] FAIL |
| Browser verification | [ ] PASS / [ ] FAIL / [ ] N/A |
| API verification | [ ] PASS / [ ] FAIL / [ ] N/A |
| Edge cases | [ ] PASS / [ ] FAIL |
| Test suite | [ ] PASS / [ ] FAIL |

## Sign-off

- [ ] All verification items checked
- [ ] No unfilled placeholders in this document
- [ ] Feature works as specified in spec.md
- [ ] Ready for `specflow complete`

**Verified by:** [name/agent]
**Date:** [YYYY-MM-DD]
