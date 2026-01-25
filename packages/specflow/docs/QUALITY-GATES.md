# Quality Gates (Eval System)

SpecFlow includes automatic quality gates using `specflow eval`.

## Available Rubrics

| Rubric | Phase | Threshold | Location |
|--------|-------|-----------|----------|
| `spec-quality` | SPECIFY | 80% | `evals/rubrics/spec-quality.yaml` |
| `plan-quality` | PLAN | 80% | `evals/rubrics/plan-quality.yaml` |

## spec-quality Rubric

- Acceptance Criteria (40%) - Testable, Given/When/Then format
- Scope Definition (25%) - In/out scope, dependencies
- Error Handling (20%) - Failure scenarios defined
- Technical Clarity (15%) - NFRs, constraints

## plan-quality Rubric

- Spec Traceability (30%) - Every FR/NFR has implementation approach
- Architectural Soundness (25%) - Clear boundaries, follows patterns
- Failure Resilience (20%) - Failure modes, recovery, blast radius
- Implementation Concreteness (15%) - Actual paths, complete models
- Verifiability (10%) - TDD strategy, test mapping

## Running Evals

```bash
specflow eval run                         # Run all evals
specflow eval run --rubric spec-quality   # Run specific rubric
specflow eval list                        # List test cases
specflow eval history                     # Show past eval runs
```

## Handling Failed Evals

If below threshold, actionable feedback shows:
- Impact levels (High/Medium/Low) for each criterion
- Quick wins to address first
- Specific recommendations

Use `specflow revise F-N --spec --feedback "your feedback"` to iterate on artifacts that fail quality gates.

## Constitutional Compliance Checklist

Part of plan-quality evaluation (pass/fail gate):

- [ ] CLI-First: Exposes command-line interface
- [ ] Library-First: Core logic as reusable module
- [ ] Test-First: TDD strategy defined
- [ ] Deterministic: Avoids probabilistic behavior
- [ ] Code Before Prompts: Logic in code, not prompts
