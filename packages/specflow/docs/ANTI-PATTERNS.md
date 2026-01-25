# SpecFlow Anti-Patterns

These are documented failures. Do not repeat them.

## Anti-Pattern 1: "Init and Abandon"

```bash
# WRONG - This is NOT using SpecFlow
specflow init --from-features features.json
# ... immediately starts writing code ...
# ... never runs specify, plan, or tasks ...
# Result: specflow status shows 0% at end
```

**Why it's wrong**: Running `specflow init` without following through with `specify`, `plan`, `tasks` for each feature means you're not using SpecFlow at all.

## Anti-Pattern 2: "Quick Questions Instead of Interview"

```
# WRONG - This is NOT the interview process
AskUserQuestion: "React or Vue?" "Auth or no auth?"
# ... 4 quick multiple choice questions ...
# ... skips to implementation ...
```

**Why it's wrong**: The SPECIFY phase requires an 8-phase structured interview covering Problem, Users, Context, Constraints, UX, Edge Cases, Success Criteria, and Scope. A few clarifying questions is not the same thing.

## Anti-Pattern 3: "Time Pressure Rationalization"

```
# WRONG - Internal monologue
"Since this is a one-day demo, I'll skip the spec process..."
"The user wants this fast, so I'll just code it..."
"This is simple enough that I don't need specs..."
```

**Why it's wrong**: If the user asked for SpecFlow, they want the process. If time is limited, build fewer features with full specs rather than more features with no specs. ASK before deviating.

## Anti-Pattern 4: "TodoWrite for Code, Not Process"

```
# WRONG - Tracking only implementation
todos: [
  "Implement SSL scanner",
  "Implement DNS scanner",
  "Build frontend"
]
```

**Correct approach**:
```
# RIGHT - Tracking SpecFlow phases
todos: [
  "F-1: Run specflow specify",
  "F-1: Conduct 8-phase interview",
  "F-1: Write spec.md",
  "F-1: Run spec-quality eval",
  "F-1: Run specflow plan",
  "F-1: Write plan.md",
  "F-1: Run plan-quality eval",
  "F-1: Run specflow tasks",
  "F-1: Write tasks.md",
  "F-1: Implement T-1.1 (RED→GREEN→BLUE)",
  "F-1: Implement T-1.2",
  "F-1: Create verify.md",
  "F-1: Run specflow complete"
]
```

## Anti-Pattern 5: "Test File as TDD"

```
# WRONG - Writing one test file is not TDD
- Created tests/domain-validator.test.ts
- Implemented everything else without tests
- "I did TDD" ❌
```

**Why it's wrong**: TDD means RED→GREEN→BLUE for EVERY task. One test file for one component while 8 other components have zero tests is not TDD.
