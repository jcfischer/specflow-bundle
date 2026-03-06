# Implementation Tasks: F-091 TDD Test Traceability

## Progress Tracking

| Task | Status | Notes |
|------|--------|-------|
| T-1.1 | ☐ | |
| T-1.2 | ☐ | |
| T-1.3 | ☐ | |
| T-1.4 | ☐ | |
| T-1.5 | ☐ | |
| T-2.1 | ☐ | |
| T-2.2 | ☐ | |
| T-2.3 | ☐ | |
| T-3.1 | ☐ | |
| T-3.2 | ☐ | |
| T-3.3 | ☐ | |
| T-3.4 | ☐ | |
| T-3.5 | ☐ | |
| T-3.6 | ☐ | |
| T-4.1 | ☐ | |

---

## Group 1: Foundation

### T-1.1: Add fast-xml-parser dependency [P]
- **File:** packages/specflow/package.json
- **Dependencies:** none
- **Description:** Add `fast-xml-parser` (^4.3.0) to dependencies for JUnit XML parsing. Run `bun install` to update lockfile.

### T-1.2: Create data model types [T] [P]
- **File:** packages/specflow/src/lib/test-traceability/types.ts
- **Test:** packages/specflow/src/lib/test-traceability/types.test.ts
- **Dependencies:** none
- **Description:** Define TypeScript interfaces and Zod schemas for:
  - `TestRegistry` and `TestRegistryEntry` (stable test IDs)
  - `TestRun`, `TestRunSummary`, `TestResult` (run history)
  - `TestDelta` (diff between runs)
  - `ConvergenceState` (trend tracking)
  - `FeatureTestSummary` (aggregated stats)
  - `JUnitParseOptions`, `JUnitParseResult`, `ParsedTestCase` (parser types)

### T-1.3: Create JUnit XML parser [T]
- **File:** packages/specflow/src/lib/test-traceability/junit-parser.ts
- **Test:** packages/specflow/src/lib/test-traceability/junit-parser.test.ts
- **Dependencies:** T-1.1, T-1.2
- **Description:** Implement JUnit XML parsing:
  - `parseJUnitXml(content: string, options?: JUnitParseOptions): JUnitParseResult`
  - `normalizeTestCase(rawCase: unknown): ParsedTestCase`
  - Handle edge cases: missing time attribute, empty classname, nested testsuites, multiple failures
  - Graceful degradation for malformed XML (warn, don't crash)
  - Reject files >10MB with error

### T-1.4: Create Registry operations [T] [P with T-1.3, T-1.5]
- **File:** packages/specflow/src/lib/test-traceability/registry.ts
- **Test:** packages/specflow/src/lib/test-traceability/registry.test.ts
- **Dependencies:** T-1.2
- **Description:** Implement test ID registry:
  - `loadRegistry(specifyPath: string): TestRegistry`
  - `saveRegistry(specifyPath: string, registry: TestRegistry): void`
  - `getOrCreateTestId(registry: TestRegistry, file: string, name: string): string`
  - `lookupTestById(registry: TestRegistry, id: string): TestRegistryEntry | null`
  - `lookupTestByKey(registry: TestRegistry, file: string, name: string): TestRegistryEntry | null`
  - Storage path: `.specify/tests/registry.json`
  - Composite key format: `{file}:{name}`
  - ID format: `UT-{n}` (monotonic counter)

### T-1.5: Create History operations [T] [P with T-1.3, T-1.4]
- **File:** packages/specflow/src/lib/test-traceability/history.ts
- **Test:** packages/specflow/src/lib/test-traceability/history.test.ts
- **Dependencies:** T-1.2
- **Description:** Implement run history storage:
  - `getHistoryDir(specifyPath: string, featureId: string): string`
  - `ensureHistoryDir(specifyPath: string, featureId: string): void`
  - `loadRuns(specifyPath: string, featureId: string): TestRun[]`
  - `saveRun(specifyPath: string, featureId: string, run: TestRun): void`
  - `getLatestRun(specifyPath: string, featureId: string): TestRun | null`
  - `getRunByIteration(specifyPath: string, featureId: string, iteration: number): TestRun | null`
  - `getNextIteration(specifyPath: string, featureId: string): number`
  - Storage path: `.specify/tests/history/{featureId}/run-{timestamp}.json`
  - Atomic writes via temp file + rename

---

## Group 2: Core Logic

### T-2.1: Implement Delta computation [T]
- **File:** packages/specflow/src/lib/test-traceability/delta.ts
- **Test:** packages/specflow/src/lib/test-traceability/delta.test.ts
- **Dependencies:** T-1.2, T-1.4, T-1.5
- **Description:** Implement delta between consecutive runs:
  - `computeDelta(previous: TestRun, current: TestRun): TestDelta`
  - `formatDelta(delta: TestDelta, registry: TestRegistry): string`
  - Identify: fixed (fail→pass), broken (pass→fail), newTests, removed
  - Compute summary delta (total/passed/failed changes)

### T-2.2: Implement Convergence tracking [T] [P with T-2.1]
- **File:** packages/specflow/src/lib/test-traceability/convergence.ts
- **Test:** packages/specflow/src/lib/test-traceability/convergence.test.ts
- **Dependencies:** T-1.2, T-1.5
- **Description:** Implement convergence analysis:
  - `computeConvergence(runs: TestRun[]): ConvergenceState`
  - `formatConvergence(state: ConvergenceState): string`
  - Track failure count trajectory
  - Detect converging (decreasing failures) vs diverging (increasing failures)
  - Detect achieved state (zero failures after previously failing)
  - Warn after 20 iterations with advisory message

### T-2.3: Implement Summary & Stats computation [T]
- **File:** packages/specflow/src/lib/test-traceability/summary.ts
- **Test:** packages/specflow/src/lib/test-traceability/summary.test.ts
- **Dependencies:** T-1.2, T-1.4, T-1.5, T-2.1, T-2.2
- **Description:** Implement feature summary:
  - `computeSummary(featureId: string, runs: TestRun[], registry: TestRegistry): FeatureTestSummary`
  - `saveSummary(specifyPath: string, featureId: string, summary: FeatureTestSummary): void`
  - `loadSummary(specifyPath: string, featureId: string): FeatureTestSummary | null`
  - `formatStats(summary: FeatureTestSummary, registry: TestRegistry): string`
  - Track: uniqueTestCount, everFailed, alwaysPassed, first/last run timestamps
  - Storage path: `.specify/tests/history/{featureId}/summary.json`

---

## Group 3: CLI Integration

### T-3.1: Add --junit option to test command [T]
- **File:** packages/specflow/src/commands/test.ts
- **Test:** packages/specflow/src/commands/test.test.ts
- **Dependencies:** T-1.3, T-1.4, T-1.5, T-2.1
- **Description:** Add `--junit <path>` option to ingest JUnit XML:
  - Validate feature exists
  - Read and parse JUnit XML file
  - Resolve test IDs (create new ones for unknown tests)
  - Store run in history with iteration number
  - Compute and display delta if previous run exists
  - Output format per spec: test count, new tests, delta summary

### T-3.2: Add --delta option to test command [T] [P with T-3.3, T-3.4, T-3.5]
- **File:** packages/specflow/src/commands/test.ts
- **Test:** packages/specflow/src/commands/test.test.ts
- **Dependencies:** T-2.1, T-3.1
- **Description:** Add `--delta` option to show change from previous run:
  - Load last two runs from history
  - Compute and format delta
  - Display fixed/broken/new/removed tests with IDs and names
  - Show helpful message if no history exists

### T-3.3: Add --converge option to test command [T] [P with T-3.2, T-3.4, T-3.5]
- **File:** packages/specflow/src/commands/test.ts
- **Test:** packages/specflow/src/commands/test.test.ts
- **Dependencies:** T-2.2, T-3.1
- **Description:** Add `--converge` option for convergence tracking:
  - Load all runs from history
  - Compute and display convergence state
  - Show failure trajectory (e.g., "12 → 8 → 5 → 2 → 0")
  - Indicate converging vs diverging status
  - Warn on divergence with actionable message

### T-3.4: Add --history option to test command [T] [P with T-3.2, T-3.3, T-3.5]
- **File:** packages/specflow/src/commands/test.ts
- **Test:** packages/specflow/src/commands/test.test.ts
- **Dependencies:** T-1.5, T-3.1
- **Description:** Add `--history` option to view run history:
  - Load all runs for feature
  - Display chronological table: iteration, timestamp, pass/fail/skip, delta summary
  - Mark converged iteration if applicable

### T-3.5: Add --trace option to test command [T] [P with T-3.2, T-3.3, T-3.4]
- **File:** packages/specflow/src/commands/test.ts
- **Test:** packages/specflow/src/commands/test.test.ts
- **Dependencies:** T-1.4, T-1.5, T-3.1
- **Description:** Add `--trace <testId>` option to view test journey:
  - Validate test ID exists in registry
  - Load all runs and extract this test's status across iterations
  - Display: file, first seen date, status/duration/message per iteration
  - Summarize: fail count, pass count, when fixed (if applicable)

### T-3.6: Add --stats option to test command [T]
- **File:** packages/specflow/src/commands/test.ts
- **Test:** packages/specflow/src/commands/test.test.ts
- **Dependencies:** T-2.3, T-3.1
- **Description:** Add `--stats` option for aggregate statistics:
  - Load or compute summary for feature
  - Display: iteration count, unique tests, always-passed, ever-failed
  - Show convergence trajectory and status
  - Show first/last run timestamps

---

## Group 4: Harden Integration

### T-4.1: Integrate test convergence into harden template [T]
- **File:** packages/specflow/src/lib/harden.ts
- **Test:** packages/specflow/src/lib/harden.test.ts
- **Dependencies:** T-2.3
- **Description:** Add test convergence section to acceptance template:
  - Check for `.specify/tests/history/{featureId}/summary.json`
  - If present, include "Test Convergence Summary" section in template
  - Show: starting failures, final failures, iterations to converge, unique tests
  - Show failure trajectory
  - Graceful fallback: no section if no test history exists

---

## Execution Order

```
Phase 1 (Foundation - parallel):
  T-1.1 ──┐
  T-1.2 ──┼── all can start immediately
          │
Phase 2 (Foundation - after T-1.2):
  T-1.3 ──┐
  T-1.4 ──┼── can run in parallel after T-1.2
  T-1.5 ──┘
          │
Phase 3 (Core - after foundation):
  T-2.1 ──┬── can run in parallel
  T-2.2 ──┘
          │
  T-2.3 ──── after T-2.1, T-2.2
          │
Phase 4 (CLI - after T-3.1):
  T-3.1 ──── must be first (foundation for other CLI options)
          │
  T-3.2 ──┐
  T-3.3 ──┼── can run in parallel after T-3.1
  T-3.4 ──┤
  T-3.5 ──┘
          │
  T-3.6 ──── after T-2.3
          │
Phase 5 (Integration):
  T-4.1 ──── after T-2.3
```

## Dependency Graph

```
T-1.1 (dependency) ─────────────────────────────────┐
                                                    │
T-1.2 (types) ──┬── T-1.3 (junit parser) ──────────┤
                │                                   │
                ├── T-1.4 (registry) ──┬── T-2.1 ──┼── T-3.1 (--junit) ──┬── T-3.2 (--delta)
                │                      │           │                     │
                └── T-1.5 (history) ───┤           │                     ├── T-3.3 (--converge)
                                       │           │                     │
                                       ├── T-2.2 ──┘                     ├── T-3.4 (--history)
                                       │                                 │
                                       └── T-2.3 (summary) ──────────────┼── T-3.5 (--trace)
                                                   │                     │
                                                   │                     └── T-3.6 (--stats)
                                                   │
                                                   └── T-4.1 (harden integration)
```

## File Summary

| Path | Action | Tasks |
|------|--------|-------|
| `packages/specflow/package.json` | Modify | T-1.1 |
| `packages/specflow/src/lib/test-traceability/types.ts` | Create | T-1.2 |
| `packages/specflow/src/lib/test-traceability/types.test.ts` | Create | T-1.2 |
| `packages/specflow/src/lib/test-traceability/junit-parser.ts` | Create | T-1.3 |
| `packages/specflow/src/lib/test-traceability/junit-parser.test.ts` | Create | T-1.3 |
| `packages/specflow/src/lib/test-traceability/registry.ts` | Create | T-1.4 |
| `packages/specflow/src/lib/test-traceability/registry.test.ts` | Create | T-1.4 |
| `packages/specflow/src/lib/test-traceability/history.ts` | Create | T-1.5 |
| `packages/specflow/src/lib/test-traceability/history.test.ts` | Create | T-1.5 |
| `packages/specflow/src/lib/test-traceability/delta.ts` | Create | T-2.1 |
| `packages/specflow/src/lib/test-traceability/delta.test.ts` | Create | T-2.1 |
| `packages/specflow/src/lib/test-traceability/convergence.ts` | Create | T-2.2 |
| `packages/specflow/src/lib/test-traceability/convergence.test.ts` | Create | T-2.2 |
| `packages/specflow/src/lib/test-traceability/summary.ts` | Create | T-2.3 |
| `packages/specflow/src/lib/test-traceability/summary.test.ts` | Create | T-2.3 |
| `packages/specflow/src/commands/test.ts` | Modify | T-3.1, T-3.2, T-3.3, T-3.4, T-3.5, T-3.6 |
| `packages/specflow/src/commands/test.test.ts` | Modify | T-3.1, T-3.2, T-3.3, T-3.4, T-3.5, T-3.6 |
| `packages/specflow/src/lib/harden.ts` | Modify | T-4.1 |
| `packages/specflow/src/lib/harden.test.ts` | Modify | T-4.1 |

## Module Index

Create barrel export at `packages/specflow/src/lib/test-traceability/index.ts`:

```typescript
export * from './types';
export * from './junit-parser';
export * from './registry';
export * from './history';
export * from './delta';
export * from './convergence';
export * from './summary';
```
