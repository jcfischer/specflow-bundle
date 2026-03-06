# F-091: TDD Test Traceability

## Problem & Pain

SpecFlow's TDD workflow runs tests repeatedly during implementation, but results are ephemeral—each run overwrites the previous state. This creates several pain points:

1. **No iteration history** — When a test suite goes from 5 failing to 3 failing to 0 failing, there's no record of that progression. Debugging regressions requires mental reconstruction.
2. **Unstable test identification** — Tests are identified by name strings which can change during refactoring, making it impossible to track a specific test across runs.
3. **No delta visibility** — "Which tests broke since last run?" and "Which tests were fixed?" require manual diff comparison of terminal output.
4. **No convergence signal** — During TDD, knowing whether you're converging (fewer failures each iteration) or diverging helps calibrate effort. Currently this requires mental tracking.
5. **JUnit reports go unused** — Many test frameworks emit JUnit XML, but SpecFlow doesn't consume it for structured analysis.
6. **Harden phase lacks test archaeology** — The HARDEN phase (F-089) generates acceptance tests but has no visibility into the unit test journey that led there.

These gaps undermine the "test-driven" part of TDD by making test evolution invisible.

## Users & Context

**Primary user:** Developers using SpecFlow's TDD workflow, particularly in agent-driven implementation where multiple test-fix iterations happen autonomously.

**Usage context:**
- Iterative implementation: run tests → fix code → run tests → repeat
- Multiple features in flight, each with their own test history
- Need to answer: "Are we converging?" / "What regressed?" / "How many iterations did this take?"
- Post-implementation review: understanding the test journey for a feature

## Constraints

- Must integrate with existing SpecFlow phase model (extends IMPLEMENT and HARDEN phases)
- Storage must be file-based (`.specify/tests/history/`) for git visibility and portability
- Test IDs must be stable across runs even when test names change
- Must parse JUnit XML (the lingua franca of test reports)
- Must handle missing/partial JUnit output gracefully (not all test runs produce XML)
- No external dependencies (SQLite, etc.) — JSON files only
- Must not break existing `specflow test` behavior

## Solution

### Stable Test IDs

Each unique test gets a stable ID (UT-1, UT-2, etc.) based on first appearance. IDs are stored in a registry:

```
.specify/tests/registry.json
```

Format:
```json
{
  "UT-1": { "name": "should create feature", "file": "feature.test.ts", "firstSeen": "2024-01-15T10:30:00Z" },
  "UT-2": { "name": "should validate input", "file": "validate.test.ts", "firstSeen": "2024-01-15T10:30:00Z" }
}
```

Test matching uses file + name as the composite key. If a test is renamed but stays in the same file, a new ID is assigned (names are semantic).

### Run History

Each test run is stored as a timestamped snapshot:

```
.specify/tests/history/{featureId}/
  run-2024-01-15T10-30-00Z.json
  run-2024-01-15T10-45-00Z.json
  run-2024-01-15T11-00-00Z.json
```

Run format:
```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "iteration": 1,
  "source": "junit" | "stdout" | "manual",
  "summary": { "total": 15, "passed": 10, "failed": 5, "skipped": 0 },
  "tests": [
    { "id": "UT-1", "status": "pass", "duration": 45 },
    { "id": "UT-2", "status": "fail", "message": "Expected true, got false" }
  ]
}
```

### JUnit Parsing

The `specflow test` command gains `--junit <path>` option to ingest JUnit XML:

```bash
specflow test F-091 --junit ./test-results/junit.xml
```

Parser extracts:
- Test name and file from `<testcase classname="..." name="...">`
- Status from presence/absence of `<failure>` or `<skipped>` elements
- Duration from `time` attribute
- Failure message from `<failure message="...">` content

### Delta Computation

Deltas are computed between consecutive runs:

```typescript
interface TestDelta {
  fixed: string[];      // Tests that were failing, now pass (by ID)
  broken: string[];     // Tests that were passing, now fail (by ID)
  newTests: string[];   // Tests appearing for the first time
  removed: string[];    // Tests that disappeared
}
```

The `specflow test --delta` flag shows deltas after each run:

```
Tests: 15 total, 12 passed, 3 failed

Delta from previous run:
  Fixed (2): UT-3, UT-7
  Broken (1): UT-12
  New (0)
```

### Convergence Mode

The `--converge` flag enables convergence tracking:

```bash
specflow test F-091 --converge
```

This mode:
1. Tracks failure count across iterations
2. Reports convergence trend: "Converging: 5 → 3 → 1 failures"
3. Warns on divergence: "Warning: failures increased (3 → 5)"
4. Exits with special code when all tests pass after previously failing (convergence achieved)

### History Commands

New subcommands for test archaeology:

```bash
# Show test history for a feature
specflow test F-091 --history

# Show specific test's journey
specflow test F-091 --trace UT-5

# Show summary statistics
specflow test F-091 --stats
```

### Integration with Harden Phase

The HARDEN phase (F-089) can reference test history:

- `specflow harden F-091` includes test convergence summary in the acceptance template
- Review package includes iteration count and convergence trajectory
- Enables questions like: "How many TDD iterations did this feature require?"

## Storage Structure

```
.specify/
  tests/
    registry.json              # Global test ID registry
    history/
      f-091/
        run-2024-01-15T10-30-00Z.json
        run-2024-01-15T10-45-00Z.json
        summary.json           # Aggregated stats for the feature
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `specflow test F-N` | Run tests (existing behavior, unchanged) |
| `specflow test F-N --junit <path>` | Ingest JUnit XML results |
| `specflow test F-N --delta` | Show delta from previous run |
| `specflow test F-N --converge` | Enable convergence tracking |
| `specflow test F-N --history` | Show run history |
| `specflow test F-N --trace UT-N` | Show specific test's journey |
| `specflow test F-N --stats` | Show summary statistics |

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Assign stable IDs (UT-N) to tests based on file+name composite key | High |
| FR-2 | Store test run results in `.specify/tests/history/{featureId}/` as JSON | High |
| FR-3 | Parse JUnit XML format and extract test results | High |
| FR-4 | Compute deltas (fixed/broken/new/removed) between consecutive runs | High |
| FR-5 | Track iteration number across runs within a feature | Medium |
| FR-6 | Implement convergence mode with trend reporting | Medium |
| FR-7 | Provide `--history` command to view run history | Medium |
| FR-8 | Provide `--trace` command to view individual test journey | Low |
| FR-9 | Integrate test history summary into harden phase output | Low |
| FR-10 | Provide `--stats` command for aggregate statistics | Low |

## Prior Art

- **mellanon's `specflow tdd` command** — Prototype implementation (~1500 lines) with JUnit parsing, stable test IDs, delta tracking, and `--converge` mode. Commit `dcf18c5` on mellanon fork.
- **mellanon's harden iteration tracking** — Extended harden to store evaluation history with iteration numbers in `evaluations/` subdirectory.

## Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | History files must be human-readable JSON (pretty-printed) |
| NFR-2 | Registry lookup must be O(1) for test ID resolution |
| NFR-3 | Must handle test suites up to 1000 tests without performance degradation |
| NFR-4 | JUnit parsing must handle malformed XML gracefully (warn, don't crash) |
| NFR-5 | Storage footprint: ~1KB per run for typical 50-test suite |

## User Scenarios

### Scenario 1: Track TDD Iteration Progress

- **Given** a feature F-091 in IMPLEMENT phase with failing tests
- **When** developer runs `specflow test F-091 --converge` repeatedly while fixing code
- **Then** each run is stored with an incrementing iteration number
- **And** delta output shows which tests were fixed since last run
- **And** convergence trend is displayed ("5 → 3 → 1 failures")

### Scenario 2: Investigate a Regression

- **Given** a feature with test history showing UT-7 previously passed
- **When** developer runs `specflow test F-091 --trace UT-7`
- **Then** output shows UT-7's status across all runs (pass → pass → fail)
- **And** the run where it broke is identified with timestamp

### Scenario 3: Ingest External JUnit Results

- **Given** a CI pipeline that produces JUnit XML at `./reports/junit.xml`
- **When** developer runs `specflow test F-091 --junit ./reports/junit.xml`
- **Then** results are parsed and stored in history
- **And** new tests get assigned stable IDs in the registry
- **And** delta is computed against previous run

### Scenario 4: Review Test Journey in Harden Phase

- **Given** a feature F-091 that completed implementation after 8 TDD iterations
- **When** developer runs `specflow harden F-091`
- **Then** the acceptance test template includes a "Test Convergence" section
- **And** section shows: "8 iterations, converged from 12 → 0 failures"

## Success Criteria

- [ ] Tests receive stable IDs that persist across runs
- [ ] JUnit XML parsing correctly extracts test results
- [ ] Delta computation correctly identifies fixed/broken tests
- [ ] Convergence mode reports trend direction accurately
- [ ] History is stored in `.specify/tests/history/` and is git-friendly
- [ ] `--history` command shows chronological run summary
- [ ] `--trace` command shows individual test journey
- [ ] Harden phase includes test convergence summary
- [ ] All existing `specflow test` behavior remains unchanged (backwards compatible)
- [ ] Test coverage for new functionality

## Assumptions

- Test frameworks emit JUnit XML or compatible format
- Test names are reasonably stable (not randomly generated)
- Features have a bounded number of TDD iterations (< 100 per feature)

## Open Questions

- [TO BE CLARIFIED] Should history be pruned after N runs or kept indefinitely?
- [TO BE CLARIFIED] What happens to test IDs when tests are deleted and re-added?
- [TO BE CLARIFIED] Should `--converge` have a timeout/max-iterations safety limit?

## Anti-Requirements

- **No real-time streaming** — Results are ingested after test run completes, not streamed
- **No test execution** — This feature tracks results, not runs tests (that's existing `specflow test`)
- **No coverage tracking** — Code coverage is a separate concern
- **No flaky test detection** — Statistical flakiness analysis is out of scope

## Scope

### In Scope
- Stable test ID assignment and registry
- JUnit XML parsing
- Run history storage
- Delta computation
- Convergence tracking
- History/trace/stats commands
- Harden phase integration

### Out of Scope
- Other test report formats (TAP, TestNG, etc.)
- Test execution orchestration
- Code coverage integration
- CI/CD pipeline integration
- Visual dashboards
