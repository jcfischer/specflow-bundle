# F-091: TDD Test Traceability — Technical Plan

## Architecture Overview

```
                         CLI Layer
┌────────────────────────────────────────────────────────────────┐
│                    specflow test F-N [options]                 │
│    --junit <path>  --delta  --converge  --history  --trace     │
└───────────────┬───────────────────────────────────┬────────────┘
                │                                   │
                ▼                                   ▼
┌──────────────────────────────┐   ┌──────────────────────────────┐
│     commands/test.ts         │   │     commands/harden.ts       │
│  (existing + new options)    │   │  (integration for summary)   │
└──────────────┬───────────────┘   └──────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────┐
│                        lib/test-traceability.ts                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Registry  │  │   History   │  │    Delta    │             │
│  │  (UT-N IDs) │  │  (Run Data) │  │ (Diff Runs) │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   JUnit     │  │ Convergence │  │    Stats    │             │
│  │   Parser    │  │   Tracker   │  │  Generator  │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     File-based Storage                          │
│  .specify/tests/                                                │
│  ├── registry.json           # Global test ID registry          │
│  └── history/                                                   │
│      └── f-091/                                                 │
│          ├── run-2024-01-15T10-30-00Z.json                     │
│          ├── run-2024-01-15T10-45-00Z.json                     │
│          └── summary.json                                       │
└─────────────────────────────────────────────────────────────────┘
```

## Architecture Decisions

### Decision 1: File-based Storage (No Database)

**Choice:** Store test history as JSON files in `.specify/tests/`, not in SQLite.

**Rationale:**
1. Spec explicitly states "No external dependencies (SQLite, etc.) — JSON files only"
2. Git-friendly: test history becomes part of the repo, visible in diffs
3. Portable: no migration needed, works with existing databases
4. Human-readable: developers can inspect history files directly

**Alternative rejected:** Adding tables to the existing SQLite database. While this would follow the F-089 pattern, the spec explicitly prohibits it and files provide better developer experience for test archaeology.

### Decision 2: Stable Test IDs via Composite Key

**Choice:** Test identity = `{file}:{name}` hashed to a stable ID.

**Rationale:**
- File path provides context even if names collide across files
- Name changes within the same file = new test (intentional — names are semantic)
- Simple monotonic counter (UT-1, UT-2) for human-readability
- Hash stored for future collision detection but not exposed to users

**Alternative rejected:** Name-only matching (too many collisions) or full content hashing (changes on any edit).

### Decision 3: Extend Existing Test Command

**Choice:** Add new options to the existing `specflow test` command rather than creating new commands.

**Rationale:**
- Follows principle of least surprise — users already know `specflow test`
- Options are composable: `--junit`, `--delta`, `--converge` can combine
- Backward compatible: existing usage unchanged

**Alternative rejected:** Creating `specflow tdd` or `specflow test-trace` commands. This would fragment the CLI and make discovery harder.

### Decision 4: Iteration Isolation Per Feature

**Choice:** Test history is scoped to feature ID, not global.

**Rationale:**
- During TDD, you're focused on one feature's tests
- Avoids cross-contamination when multiple features are in-flight
- Enables per-feature stats and convergence tracking
- Matches the feature-centric SpecFlow model

## Technology Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Runtime | Bun | Project standard, used throughout specflow |
| Storage | JSON files | Spec requirement, git-friendly |
| XML Parsing | `fast-xml-parser` | Zero-dep, 2MB, handles malformed XML gracefully |
| CLI | Commander.js | Existing pattern in specflow |
| Types | TypeScript | Project standard |

### Why `fast-xml-parser`?

- No native dependencies (unlike `xml2js` which uses sax)
- Handles malformed XML with configurable strictness
- Actively maintained, 7M+ weekly downloads
- Small footprint (~60KB minified)

**Alternative considered:** `cheerio` (heavier, DOM-based), native regex parsing (brittle for edge cases).

## Data Model

### Test Registry

```typescript
/**
 * Global registry mapping composite keys to stable IDs
 * Stored in: .specify/tests/registry.json
 */
interface TestRegistry {
  /** Map of stable ID to test metadata */
  tests: Record<string, TestRegistryEntry>;
  /** Counter for generating next ID */
  nextId: number;
  /** Last updated timestamp */
  updatedAt: string;
}

interface TestRegistryEntry {
  /** Unique stable ID (e.g., "UT-1") */
  id: string;
  /** Test name from test framework */
  name: string;
  /** File path (relative to project root) */
  file: string;
  /** Composite key for lookup: "{file}:{name}" */
  key: string;
  /** When this test was first seen */
  firstSeen: string;
  /** SHA-256 hash of key for collision detection */
  keyHash: string;
}
```

### Run History

```typescript
/**
 * Single test run result
 * Stored in: .specify/tests/history/{featureId}/run-{timestamp}.json
 */
interface TestRun {
  /** ISO timestamp of this run */
  timestamp: string;
  /** Iteration number within this feature (1-indexed) */
  iteration: number;
  /** Feature ID this run belongs to */
  featureId: string;
  /** Source of results */
  source: "junit" | "stdout" | "manual";
  /** Path to original JUnit file (if source=junit) */
  junitPath?: string;
  /** Aggregate summary */
  summary: TestRunSummary;
  /** Individual test results */
  tests: TestResult[];
}

interface TestRunSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  /** Total duration in milliseconds */
  durationMs: number;
}

interface TestResult {
  /** Stable test ID (e.g., "UT-1") */
  id: string;
  /** Test name (for display) */
  name: string;
  /** Test file */
  file: string;
  /** Outcome */
  status: "pass" | "fail" | "skip" | "error";
  /** Duration in milliseconds */
  durationMs: number;
  /** Failure message (if status=fail or error) */
  message?: string;
  /** Stack trace (if available) */
  stackTrace?: string;
}
```

### Delta

```typescript
/**
 * Computed difference between two consecutive runs
 */
interface TestDelta {
  /** Iteration being compared (N vs N-1) */
  fromIteration: number;
  toIteration: number;
  /** Tests that were failing, now pass */
  fixed: string[];
  /** Tests that were passing, now fail */
  broken: string[];
  /** Tests appearing for the first time */
  newTests: string[];
  /** Tests that disappeared */
  removed: string[];
  /** Summary stats change */
  summaryDelta: {
    total: number;    // +2 means 2 more tests
    passed: number;
    failed: number;
  };
}
```

### Convergence State

```typescript
/**
 * Tracks convergence across iterations
 * Computed from run history, not persisted separately
 */
interface ConvergenceState {
  /** Feature ID */
  featureId: string;
  /** Number of iterations so far */
  iterations: number;
  /** Failure count trajectory: [12, 8, 5, 2, 0] */
  failureCounts: number[];
  /** Is the trend converging? */
  isConverging: boolean;
  /** Did we achieve zero failures? */
  achieved: boolean;
  /** Warning if diverging */
  warning?: string;
}
```

### Feature Summary

```typescript
/**
 * Aggregated stats for a feature's test history
 * Stored in: .specify/tests/history/{featureId}/summary.json
 */
interface FeatureTestSummary {
  featureId: string;
  /** Total iterations recorded */
  totalIterations: number;
  /** Final convergence state */
  convergence: ConvergenceState;
  /** Unique tests seen across all iterations */
  uniqueTestCount: number;
  /** Tests that failed at some point */
  everFailed: string[];
  /** Tests that always passed */
  alwaysPassed: string[];
  /** First run timestamp */
  firstRun: string;
  /** Last run timestamp */
  lastRun: string;
  /** Last updated */
  updatedAt: string;
}
```

## File Structure

### New Files

```
packages/specflow/
├── src/
│   └── lib/
│       ├── test-traceability.ts           # Core business logic
│       │   ├── Registry functions
│       │   ├── History functions
│       │   ├── Delta computation
│       │   ├── Convergence tracking
│       │   └── Stats generation
│       └── junit-parser.ts                # JUnit XML parser
│           ├── parseJUnitXml()
│           └── normalizeTestCase()
└── tests/
    └── lib/
        ├── test-traceability.test.ts      # Unit tests for core logic
        └── junit-parser.test.ts           # Parser edge cases
```

### Modified Files

| File | Change |
|------|--------|
| `src/commands/test.ts` | Add options: `--junit`, `--delta`, `--converge`, `--history`, `--trace`, `--stats` |
| `src/commands/harden.ts` | Add test convergence summary to acceptance template |
| `src/index.ts` | No change needed (test command already registered) |
| `package.json` | Add `fast-xml-parser` dependency |

### Storage Paths

```
.specify/
├── tests/
│   ├── registry.json                      # Global test ID registry
│   └── history/
│       ├── f-091/
│       │   ├── run-2024-01-15T10-30-00Z.json
│       │   ├── run-2024-01-15T10-45-00Z.json
│       │   └── summary.json
│       └── f-092/
│           └── ...
└── harden/                                # Existing (F-089)
    └── ...
```

## JUnit XML Parser

### Input Format (Standard JUnit)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="Test Results" tests="15" failures="3" time="2.45">
  <testsuite name="auth.test.ts" tests="5" failures="1" time="0.89">
    <testcase classname="auth.test.ts" name="should authenticate user" time="0.12">
    </testcase>
    <testcase classname="auth.test.ts" name="should reject invalid token" time="0.08">
      <failure message="Expected true to be false">
        at Object.&lt;anonymous&gt; (auth.test.ts:45:12)
      </failure>
    </testcase>
  </testsuite>
</testsuites>
```

### Parser Design

```typescript
interface JUnitParseOptions {
  /** How to handle malformed XML */
  strictMode?: boolean;
  /** Maximum file size to parse (bytes) */
  maxSize?: number;
}

interface JUnitParseResult {
  success: boolean;
  tests: ParsedTestCase[];
  errors: string[];
  warnings: string[];
}

interface ParsedTestCase {
  /** From classname attribute (normalized to relative path) */
  file: string;
  /** From name attribute */
  name: string;
  /** Computed from presence of <failure>, <error>, <skipped> */
  status: "pass" | "fail" | "skip" | "error";
  /** From time attribute (converted to ms) */
  durationMs: number;
  /** From <failure message="..."> */
  message?: string;
  /** From <failure> text content */
  stackTrace?: string;
}
```

### Edge Cases Handled

| Case | Handling |
|------|----------|
| Missing `time` attribute | Default to 0 |
| Empty `classname` | Use "unknown" |
| Nested `<testsuite>` elements | Flatten recursively |
| `<system-out>` / `<system-err>` | Ignore (not test results) |
| Malformed XML | Return partial results + warnings |
| Multiple `<failure>` per test | Concatenate messages |
| File too large (>10MB) | Reject with error |

## Command Design

### `specflow test F-N --junit <path>`

**Flow:**
1. Validate feature exists
2. Read and parse JUnit XML
3. Resolve test IDs (create new ones for unknown tests)
4. Store run in history
5. Compute delta if previous run exists
6. Display results

**Output:**
```
Ingested test results from ./test-results/junit.xml

Tests: 15 total, 12 passed, 3 failed
  New tests: 2 (UT-14, UT-15)

Delta from previous run:
  Fixed (2): UT-3, UT-7
  Broken (1): UT-12
  New (2): UT-14, UT-15

Iteration: 5
```

### `specflow test F-N --delta`

**Flow:**
1. Load last two runs from history
2. Compute delta
3. Display change summary

**Output (no prior runs):**
```
No test history for F-091. Run tests first:
  specflow test F-091 --junit ./test-results/junit.xml
```

**Output (with history):**
```
Delta: Iteration 4 → 5

  Fixed (2):
    UT-3  should validate input
    UT-7  should handle empty array

  Broken (1):
    UT-12  should timeout on slow response

  Summary: 8 → 10 passed, 4 → 2 failed
```

### `specflow test F-N --converge`

**Flow:**
1. Load all runs from history
2. Compute convergence state
3. Display trajectory

**Output (converging):**
```
Convergence: F-091 (5 iterations)

  Failures: 12 → 8 → 5 → 2 → 0 (converged!)

  Status: All tests passing. Ready for completion.
```

**Output (diverging):**
```
Convergence: F-091 (5 iterations)

  Failures: 5 → 3 → 2 → 4 → 6 (diverging!)

  Warning: Failure count increased in last 2 iterations.
  Review recent changes for regressions.
```

### `specflow test F-N --history`

**Flow:**
1. Load all runs from history
2. Display chronological summary

**Output:**
```
Test History: F-091 (5 iterations)

  #  Timestamp            Pass  Fail  Skip  Delta
  1  2024-01-15 10:30:00    3    12     0   (baseline)
  2  2024-01-15 10:45:00    7     8     0   +4 fixed
  3  2024-01-15 11:00:00   10     5     0   +3 fixed
  4  2024-01-15 11:15:00   13     2     0   +3 fixed
  5  2024-01-15 11:30:00   15     0     0   +2 fixed (converged)
```

### `specflow test F-N --trace UT-5`

**Flow:**
1. Validate test ID exists in registry
2. Load all runs and extract this test's status
3. Display journey

**Output:**
```
Test Journey: UT-5 (should validate nested objects)

  File: src/lib/validator.test.ts
  First seen: 2024-01-15 10:30:00

  Iteration  Status   Duration  Message
  1          FAIL     45ms      Expected object to match schema
  2          FAIL     42ms      Expected object to match schema
  3          PASS     38ms      —
  4          PASS     35ms      —
  5          PASS     36ms      —

  Summary: Failed 2, Passed 3 (fixed in iteration 3)
```

### `specflow test F-N --stats`

**Flow:**
1. Load summary.json or compute from history
2. Display aggregate statistics

**Output:**
```
Test Statistics: F-091

  Iterations: 5
  Unique tests: 15
  Always passed: 3 (UT-1, UT-2, UT-8)
  Ever failed: 12

  Convergence: Achieved in 5 iterations
  Trajectory: 12 → 8 → 5 → 2 → 0

  First run: 2024-01-15 10:30:00
  Last run: 2024-01-15 11:30:00
  Total duration: 1h 0m
```

## Harden Phase Integration

When `specflow harden F-N` generates the acceptance test template, include a "Test Convergence" section if test history exists:

```markdown
# Acceptance Tests: F-091 — TDD Test Traceability

## Test Convergence Summary

This feature completed implementation after **5 TDD iterations**.

| Metric | Value |
|--------|-------|
| Starting failures | 12 |
| Final failures | 0 |
| Iterations to converge | 5 |
| Unique tests | 15 |

Failure trajectory: 12 → 8 → 5 → 2 → 0

## AT-1: ...
```

**Implementation:** In `lib/harden.ts`, add a helper that checks for `.specify/tests/history/{featureId}/summary.json` and includes the data if present.

## Implementation Phases

### Phase 1: Core Data Layer (Foundation)

**Files:**
- `src/lib/test-traceability.ts` (new)
- `src/lib/junit-parser.ts` (new)

**Functions:**
```typescript
// Registry
function loadRegistry(): TestRegistry;
function saveRegistry(registry: TestRegistry): void;
function getOrCreateTestId(registry: TestRegistry, file: string, name: string): string;
function lookupTestById(registry: TestRegistry, id: string): TestRegistryEntry | null;

// History
function getHistoryDir(featureId: string): string;
function loadRuns(featureId: string): TestRun[];
function saveRun(featureId: string, run: TestRun): void;
function getLatestRun(featureId: string): TestRun | null;
function getRunByIteration(featureId: string, iteration: number): TestRun | null;

// JUnit Parser
function parseJUnitXml(content: string, options?: JUnitParseOptions): JUnitParseResult;
```

**Tests:**
- Registry CRUD operations
- History file operations
- JUnit parsing (valid, malformed, edge cases)

### Phase 2: Delta & Convergence

**Files:**
- `src/lib/test-traceability.ts` (extend)

**Functions:**
```typescript
// Delta
function computeDelta(previous: TestRun, current: TestRun): TestDelta;
function formatDelta(delta: TestDelta, registry: TestRegistry): string;

// Convergence
function computeConvergence(runs: TestRun[]): ConvergenceState;
function formatConvergence(state: ConvergenceState): string;
```

**Tests:**
- Delta computation (fixed, broken, new, removed)
- Convergence detection (converging, diverging, achieved)

### Phase 3: CLI Integration

**Files:**
- `src/commands/test.ts` (modify)

**Changes:**
1. Add new options to command definition
2. Implement `--junit` ingestion flow
3. Implement `--delta` display
4. Implement `--converge` mode
5. Implement `--history` display
6. Implement `--trace` lookup
7. Implement `--stats` display

**Tests:**
- CLI integration tests for each option
- Option combinations (e.g., `--junit --delta`)

### Phase 4: Summary & Stats

**Files:**
- `src/lib/test-traceability.ts` (extend)

**Functions:**
```typescript
// Summary
function computeSummary(featureId: string, runs: TestRun[]): FeatureTestSummary;
function saveSummary(featureId: string, summary: FeatureTestSummary): void;
function loadSummary(featureId: string): FeatureTestSummary | null;

// Stats formatting
function formatStats(summary: FeatureTestSummary, registry: TestRegistry): string;
```

**Tests:**
- Summary computation from run history
- Stats formatting

### Phase 5: Harden Integration

**Files:**
- `src/lib/harden.ts` (modify)
- `src/commands/harden.ts` (minor)

**Changes:**
1. Import test traceability functions
2. Check for summary.json when generating template
3. Include convergence section in template

**Tests:**
- Template generation with test history
- Template generation without test history (no change)

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| JUnit format variations | Medium | High | Flexible parser with warnings, not errors. Test with real outputs from Bun, Jest, Vitest. |
| Large test suites (1000+ tests) | Low | Medium | Lazy loading, pagination in CLI output. Performance test with 1000-test fixtures. |
| Concurrent test runs writing to same history | Medium | Low | Append-only JSON files with unique timestamps. Atomic write with temp file + rename. |
| Registry ID collisions | Low | Very Low | SHA-256 hash of composite key. Detect and warn on collision. |
| Breaking existing `specflow test` | High | Low | All new options are additive. No change to default behavior. |
| Stale summary.json | Low | Medium | Recompute on each stats request, lazy-update summary. |

## Testing Strategy

### Unit Tests

```
tests/lib/test-traceability.test.ts
├── Registry
│   ├── should create registry if not exists
│   ├── should assign stable IDs to new tests
│   ├── should return existing ID for known test
│   ├── should handle test rename (new ID)
│   └── should persist across loads
├── History
│   ├── should create history dir if not exists
│   ├── should store run with correct filename
│   ├── should load runs in chronological order
│   └── should handle empty history
├── Delta
│   ├── should identify fixed tests
│   ├── should identify broken tests
│   ├── should identify new tests
│   ├── should identify removed tests
│   └── should handle identical runs
└── Convergence
    ├── should detect converging trend
    ├── should detect diverging trend
    ├── should detect achieved state
    └── should handle single run

tests/lib/junit-parser.test.ts
├── Valid XML
│   ├── should parse standard JUnit format
│   ├── should handle nested testsuites
│   ├── should extract failure messages
│   └── should handle skipped tests
├── Edge Cases
│   ├── should handle missing time attribute
│   ├── should handle empty classname
│   ├── should handle multiple failures
│   └── should truncate large stack traces
└── Malformed XML
    ├── should return partial results
    ├── should include warnings
    └── should reject oversized files
```

### Integration Tests

```
tests/commands/test-traceability.test.ts
├── --junit
│   ├── should ingest valid JUnit file
│   ├── should reject missing file
│   └── should handle parse errors gracefully
├── --delta
│   ├── should show delta when history exists
│   └── should show helpful message when no history
├── --converge
│   ├── should track failure trajectory
│   └── should warn on divergence
└── --history / --trace / --stats
    └── (coverage tests)
```

## Open Questions Resolution

### Q: Should history be pruned after N runs?

**Answer:** No automatic pruning. History is valuable for post-mortem analysis. If storage becomes a concern, users can manually delete old runs. Document that `.specify/tests/history/` can be safely cleared to reset history.

### Q: What happens to test IDs when tests are deleted and re-added?

**Answer:** New test ID is assigned. The old ID remains in registry (orphaned but harmless). Registry can be compacted manually via a future `specflow test --prune-registry` command if needed.

### Q: Should `--converge` have a timeout/max-iterations safety limit?

**Answer:** No timeout, but warn after 20 iterations with a "consider reviewing your approach" message. This is an advisory warning, not a hard limit.

## Dependencies

### External Packages

| Package | Version | Purpose |
|---------|---------|---------|
| `fast-xml-parser` | ^4.3.0 | JUnit XML parsing |

### Internal Dependencies

| Module | Usage |
|--------|-------|
| `lib/harden.ts` | Integration for template generation |
| `types.ts` | No changes needed (file-based storage) |
| `database.ts` | No changes needed (file-based storage) |

## Success Criteria Mapping

| Spec Criterion | Implementation |
|----------------|----------------|
| Tests receive stable IDs | `getOrCreateTestId()` in registry |
| JUnit XML parsing | `parseJUnitXml()` in junit-parser.ts |
| Delta computation | `computeDelta()` in test-traceability.ts |
| Convergence mode | `computeConvergence()` + `--converge` flag |
| History in `.specify/tests/history/` | `saveRun()` + file structure |
| `--history` command | CLI handler in test.ts |
| `--trace` command | CLI handler + `lookupTestById()` |
| Harden phase includes summary | `generateAcceptanceTemplate()` modification |
| Backwards compatible | All options are opt-in additions |
| Test coverage | 80%+ for new lib files |
