---
project: "[PROJECT_NAME]"
created: "[DATE]"
last_updated: "[DATE]"
---

# Technical Debt Ledger

> "Code is a liability, not an asset. The capabilities code generates are valuable, but the code itself requires constant maintenance." — Cory Doctorow

## Summary

| Metric | Value |
|--------|-------|
| Total features | 0 |
| Total debt score | 0 |
| Average debt per feature | 0 |
| High-risk features | 0 |

## Debt Score Calculation

When adding a feature, calculate its debt score:

| Factor | Points | Description |
|--------|--------|-------------|
| Base complexity | 1-5 | Simple function (1) to complex system (5) |
| External API dependency | +2 each | Each external API adds maintenance burden |
| Shared state | +3 | Global state, shared databases, caches |
| Security surface | +5 | Auth, encryption, user data handling |
| Schema changes | +3 | Database migrations, breaking changes |
| Deep dependency chain | +2 | Feature depends on 3+ other features |
| No graceful degradation | +3 | Feature has no fallback behavior |

**Risk Levels:**
- **Low (1-5):** Standard maintenance
- **Medium (6-10):** Requires regular attention
- **High (11+):** Priority for refactoring or removal

## Feature Debt Registry

| Feature ID | Name | Added | Debt Score | Risk | Key Liability | Remediation Notes |
|------------|------|-------|------------|------|---------------|-------------------|
| - | - | - | - | - | - | - |

## Debt Triggers Log

Track when and why debt was added:

| Date | Feature | Debt Added | Reason | Accepted By |
|------|---------|------------|--------|-------------|
| - | - | - | - | - |

## Remediation Queue

Features prioritized for debt reduction:

| Feature | Current Debt | Target Debt | Strategy | Priority | Blocked By |
|---------|--------------|-------------|----------|----------|------------|
| - | - | - | - | - | - |

## Remediation Strategies

Common approaches to reduce debt:

1. **Extract to library** — Move reusable code out of feature (-2 debt)
2. **Add circuit breaker** — Graceful degradation for external deps (-2 debt)
3. **Add schema versioning** — Reduce migration risk (-1 debt)
4. **Simplify state** — Reduce shared state surface (-2 debt)
5. **Delete feature** — Remove unused code (full debt removal)

## Deletion Candidates

Features that may have outlived their usefulness:

| Feature | Last Used | Debt Score | Deletion Criteria Met? | Blocker |
|---------|-----------|------------|------------------------|---------|
| - | - | - | - | - |

## Monthly Review Checklist

- [ ] Total debt score reviewed
- [ ] High-risk features identified
- [ ] Deletion candidates evaluated
- [ ] Remediation queue prioritized
- [ ] New features assessed for debt impact

---

*This ledger acknowledges that every line of code is a future maintenance burden. Track it. Reduce it. Delete what's no longer needed.*
