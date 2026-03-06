# Implementation Tasks: brownfield-evolve

## Progress Tracking

| Task | Status | Notes |
|------|--------|-------|
| T-1.1 | ☐ | Migration SQL |
| T-1.2 | ☐ | Embed migration |
| T-1.3 | ☐ | Type definitions |
| T-1.4 | ☐ | Database operations |
| T-2.1 | ☐ | Baseline index |
| T-2.2 | ☐ | Version logic |
| T-2.3 | ☐ | Snapshot/restore |
| T-3.1 | ☐ | Add ts-morph |
| T-3.2 | ☐ | File discovery |
| T-3.3 | ☐ | AST parsing |
| T-3.4 | ☐ | Test coverage extraction |
| T-4.1 | ☐ | Classifier structure |
| T-4.2 | ☐ | Claude API integration |
| T-4.3 | ☐ | Offline fallback |
| T-5.1 | ☐ | Report generation |
| T-5.2 | ☐ | Delta application |
| T-6.1 | ☐ | Command registration |
| T-6.2 | ☐ | init subcommand |
| T-6.3 | ☐ | scan subcommand |
| T-6.4 | ☐ | diff subcommand |
| T-6.5 | ☐ | review subcommand |
| T-6.6 | ☐ | apply subcommand |
| T-6.7 | ☐ | complete subcommand |
| T-6.8 | ☐ | status/abort/history |
| T-7.1 | ☐ | Phase type extension |
| T-7.2 | ☐ | Status display |
| T-7.3 | ☐ | Backwards compat |
| T-8.1 | ☐ | Documentation |
| T-8.2 | ☐ | E2E test |

---

## Group 1: Foundation (Data Layer)

### T-1.1: Create evolution tables migration [T]
- **File:** `packages/specflow/migrations/008_evolution_tables.sql`
- **Test:** `packages/specflow/tests/evolve/migration.test.ts`
- **Dependencies:** none
- **Description:** Create SQL migration with `evolution_records` and `divergences` tables per data model spec. Include indexes on feature_id, status, evolution_id, and user_decision.

### T-1.2: Embed migration in runtime [T]
- **File:** `packages/specflow/src/lib/migrations/embedded.ts`
- **Test:** `packages/specflow/tests/evolve/migration.test.ts` (extend T-1.1 tests)
- **Dependencies:** T-1.1
- **Description:** Add migration 008 to embedded migrations array. Verify migration runs correctly on fresh database and is idempotent.

### T-1.3: Add evolution type definitions [T] [P with T-1.2]
- **File:** `packages/specflow/src/types.ts`
- **Test:** `packages/specflow/tests/evolve/types.test.ts`
- **Dependencies:** T-1.1
- **Description:** Add TypeScript types: `EvolutionStatus`, `DivergenceCategory`, `DivergenceSeverity`, `DivergenceRecommendation`, `DivergenceDecision`, `EvolutionRecord`, `DivergenceSummary`, `Divergence`, `ImplementationSnapshot`, `ScannedFile`, `FunctionSignature`, `ClassSignature`, `ExportedSymbol`, `TestCoverageInfo`. Add Zod schemas for validation.

### T-1.4: Add database operations for evolution [T]
- **File:** `packages/specflow/src/lib/database.ts`
- **Test:** `packages/specflow/tests/evolve/database.test.ts`
- **Dependencies:** T-1.2, T-1.3
- **Description:** Implement CRUD functions:
  - `createEvolutionRecord(featureId, baselineVersion, targetVersion)`
  - `getEvolutionRecord(id)` / `getEvolutionByFeature(featureId)`
  - `updateEvolutionRecord(id, updates)`
  - `getActiveEvolution(featureId)`
  - `insertDivergence(divergence)`
  - `getDivergences(evolutionId)`
  - `updateDivergenceDecision(id, decision)`
  - `getDivergenceSummary(evolutionId)`

---

## Group 2: Baseline Management

### T-2.1: Create evolve module index [P]
- **File:** `packages/specflow/src/lib/evolve/index.ts`
- **Test:** none (re-export only)
- **Dependencies:** none
- **Description:** Create `lib/evolve/` directory with index.ts that re-exports all submodules. Scaffold empty files for baseline.ts, scanner.ts, classifier.ts, differ.ts.

### T-2.2: Implement version calculation logic [T]
- **File:** `packages/specflow/src/lib/evolve/baseline.ts`
- **Test:** `packages/specflow/tests/evolve/baseline.test.ts`
- **Dependencies:** T-2.1
- **Description:** Implement `getNextVersion(currentVersion: string): string`:
  - "v1" → "v1.1"
  - "v1.1" → "v1.2"
  - "v1.9" → "v2"
  - Handle edge cases (null, empty, malformed)

  Implement `parseVersion(version: string): { major: number, minor: number | null }`

### T-2.3: Implement spec snapshot and restore [T]
- **File:** `packages/specflow/src/lib/evolve/baseline.ts`
- **Test:** `packages/specflow/tests/evolve/baseline.test.ts` (extend)
- **Dependencies:** T-2.2, T-1.4
- **Description:** Implement:
  - `createBaseline(featureId)`: Copy `spec.md` to `.specify/evolve/<feature>/spec.v{N}.md`, create `spec.working.md`, return `{ baselinePath, version }`
  - `restoreBaseline(featureId)`: Copy baseline back to `spec.md`, remove working files
  - `getBaselinePath(featureId, version)`: Return path to versioned baseline
  - `listVersions(featureId)`: List all versioned baselines

---

## Group 3: Implementation Scanner

### T-3.1: Add ts-morph dependency
- **File:** `packages/specflow/package.json`
- **Test:** none (dependency install)
- **Dependencies:** none
- **Description:** Add `ts-morph@^22.0.0` to dependencies. Run `bun install`. Verify import works.

### T-3.2: Implement feature file discovery [T]
- **File:** `packages/specflow/src/lib/evolve/scanner.ts`
- **Test:** `packages/specflow/tests/evolve/scanner.test.ts`
- **Dependencies:** T-2.1, T-3.1
- **Description:** Implement `findFeatureFiles(featureId: string): string[]`:
  1. Parse `spec.md` for backtick code references (extract file paths)
  2. Check feature metadata for explicit file mappings
  3. Apply naming convention heuristic: `packages/**/<feature-name>/**/*.ts`
  4. Dedupe and filter to existing files
  5. Return sorted list of discovered paths

### T-3.3: Implement TypeScript AST parsing [T]
- **File:** `packages/specflow/src/lib/evolve/scanner.ts`
- **Test:** `packages/specflow/tests/evolve/scanner.test.ts` (extend)
- **Dependencies:** T-3.2
- **Description:** Implement `parseSourceFile(filePath: string): ScannedFile`:
  - Use ts-morph to parse TypeScript/JavaScript
  - Extract function signatures (name, params, returnType, async, exported, line)
  - Extract class signatures (name, methods, exported, line)
  - Extract export names
  - Handle parse errors gracefully (return partial results)

### T-3.4: Implement full scanner with test coverage [T]
- **File:** `packages/specflow/src/lib/evolve/scanner.ts`
- **Test:** `packages/specflow/tests/evolve/scanner.test.ts` (extend)
- **Dependencies:** T-3.3
- **Description:** Implement `scanImplementation(featureId, options?)`:
  - Call `findFeatureFiles()` to get file list
  - Parse each file with `parseSourceFile()`
  - Extract test coverage via `bun test --json` (with timeout option)
  - Aggregate into `ImplementationSnapshot`
  - Store snapshot to `.specify/evolve/<feature>/implementation-snapshot.json`

---

## Group 4: AI-Assisted Classifier

### T-4.1: Create classifier module structure [T]
- **File:** `packages/specflow/src/lib/evolve/classifier.ts`
- **Test:** `packages/specflow/tests/evolve/classifier.test.ts`
- **Dependencies:** T-2.1, T-1.3
- **Description:** Create classifier module with:
  - Type definitions for classification request/response
  - `ClassificationResult` interface with divergences array
  - Stub function signatures for `classifyDivergences()` and `classifyOffline()`

### T-4.2: Implement Claude API integration [T]
- **File:** `packages/specflow/src/lib/evolve/classifier.ts`
- **Test:** `packages/specflow/tests/evolve/classifier.test.ts` (mock tests)
- **Dependencies:** T-4.1
- **Description:** Implement `classifyDivergences(baseline, snapshot, options?)`:
  - Build prompt: spec baseline + implementation snapshot
  - Spawn headless Claude process (following harden.ts pattern)
  - Parse structured JSON response
  - Map to `Divergence[]` with categories, severity, confidence
  - Handle API errors gracefully (retry once, then fall back to offline)

### T-4.3: Implement offline classification fallback [T]
- **File:** `packages/specflow/src/lib/evolve/classifier.ts`
- **Test:** `packages/specflow/tests/evolve/classifier.test.ts` (extend)
- **Dependencies:** T-4.2
- **Description:** Implement `classifyOffline(baseline, snapshot)`:
  - Keyword-based heuristics:
    - New exports not in spec → "enhancement"
    - Missing exports from spec → "drift" or "breaking"
    - Function signature changes → "breaking" or "enhancement"
    - Test-only changes → "bugfix"
  - Lower confidence scores (0.3-0.5 range)
  - Return `Divergence[]` with `recommendation: null` (requires human review)

---

## Group 5: Diff Report Generation

### T-5.1: Implement divergence report generation [T]
- **File:** `packages/specflow/src/lib/evolve/differ.ts`
- **Test:** `packages/specflow/tests/evolve/differ.test.ts`
- **Dependencies:** T-4.1, T-1.4
- **Description:** Implement `generateDiffReport(evolutionId)`:
  - Query divergences from database
  - Generate markdown report:
    - Summary table (counts by category)
    - Divergence list grouped by category
    - Each item: location, description, recommendation, confidence
  - Generate JSON report (structured)
  - Return `{ markdown: string, json: object }`
  - Save to `.specify/evolve/<feature>/divergence-report.{md,json}`

### T-5.2: Implement delta application logic [T]
- **File:** `packages/specflow/src/lib/evolve/differ.ts`
- **Test:** `packages/specflow/tests/evolve/differ.test.ts` (extend)
- **Dependencies:** T-5.1, T-2.3
- **Description:** Implement `applyApprovedDeltas(evolutionId)`:
  - Get approved divergences from database
  - Order by priority: bugfix > enhancement > drift > cosmetic
  - For each divergence, generate spec modification
  - Implement `mergeToSpec(featureId, divergences)`:
    - Parse existing working spec structure
    - Insert new sections for enhancements
    - Update existing sections for modifications
    - Preserve formatting and structure
  - Return `{ applied: number, skipped: number }`
  - Update `applied_at` timestamps in database

---

## Group 6: CLI Integration

### T-6.1: Register evolve command group [T]
- **File:** `packages/specflow/src/commands/evolve.ts`
- **File:** `packages/specflow/src/index.ts`
- **Test:** `packages/specflow/tests/evolve/command.test.ts`
- **Dependencies:** T-1.4, T-2.3
- **Description:** Create `evolve.ts` command file with Commander.js subcommand structure. Register `specflow evolve` in index.ts. Implement command group with placeholder subcommands that output "Not implemented".

### T-6.2: Implement init subcommand [T]
- **File:** `packages/specflow/src/commands/evolve.ts`
- **Test:** `packages/specflow/tests/evolve/command.test.ts` (extend)
- **Dependencies:** T-6.1, T-2.3
- **Description:** Implement `specflow evolve init <feature-id>`:
  - Validate feature exists and is in `complete` phase
  - Check no active evolution exists
  - Call `createBaseline()`
  - Create evolution record in database
  - Update feature phase to `evolve`
  - Output: baseline path, version, next steps

### T-6.3: Implement scan subcommand [T]
- **File:** `packages/specflow/src/commands/evolve.ts`
- **Test:** `packages/specflow/tests/evolve/command.test.ts` (extend)
- **Dependencies:** T-6.2, T-3.4
- **Description:** Implement `specflow evolve scan <feature-id>`:
  - Validate feature is in `evolve` phase with active evolution
  - Call `scanImplementation()` with optional `--timeout`
  - Display discovered files count
  - Display extracted signatures count
  - Store snapshot path in evolution record
  - Output: summary of scan results

### T-6.4: Implement diff subcommand [T]
- **File:** `packages/specflow/src/commands/evolve.ts`
- **Test:** `packages/specflow/tests/evolve/command.test.ts` (extend)
- **Dependencies:** T-6.3, T-4.2, T-5.1
- **Description:** Implement `specflow evolve diff <feature-id>`:
  - Validate scan has been run (snapshot exists)
  - Read baseline spec and implementation snapshot
  - Call `classifyDivergences()` (or offline if `--offline`)
  - Store divergences in database
  - Call `generateDiffReport()`
  - Display markdown report to stdout
  - Output: divergence counts by category

### T-6.5: Implement review subcommand [T]
- **File:** `packages/specflow/src/commands/evolve.ts`
- **Test:** `packages/specflow/tests/evolve/command.test.ts` (extend)
- **Dependencies:** T-6.4
- **Description:** Implement `specflow evolve review <feature-id>`:
  - Get pending divergences from database
  - If `--approve-all`: mark all as approved
  - If `--json`: output JSON format for tooling
  - Otherwise: interactive review loop
    - Display each divergence with recommendation
    - Prompt: approve/reject/skip
    - Update database with decisions
  - Output: summary of decisions made

### T-6.6: Implement apply subcommand [T]
- **File:** `packages/specflow/src/commands/evolve.ts`
- **Test:** `packages/specflow/tests/evolve/command.test.ts` (extend)
- **Dependencies:** T-6.5, T-5.2
- **Description:** Implement `specflow evolve apply <feature-id>`:
  - Validate divergences have been reviewed
  - If `--dry-run`: show what would be applied without writing
  - Call `applyApprovedDeltas()`
  - Update working spec
  - Output: applied count, skipped count, new spec path

### T-6.7: Implement complete subcommand [T]
- **File:** `packages/specflow/src/commands/evolve.ts`
- **Test:** `packages/specflow/tests/evolve/command.test.ts` (extend)
- **Dependencies:** T-6.6
- **Description:** Implement `specflow evolve complete <feature-id>`:
  - Validate all divergences processed (none pending)
  - Copy working spec to `spec.md`
  - Update evolution record: status = completed, completed_at = now
  - Update feature phase back to `complete`
  - Clean up working files (keep versioned baselines)
  - Output: new version number, evolution summary

### T-6.8: Implement status/abort/history subcommands [T]
- **File:** `packages/specflow/src/commands/evolve.ts`
- **Test:** `packages/specflow/tests/evolve/command.test.ts` (extend)
- **Dependencies:** T-6.2
- **Description:** Implement remaining subcommands:
  - `status [feature-id]`: Show evolution progress (pending/approved/rejected counts), phase, versions. Support `--json`.
  - `abort <feature-id>`: Restore baseline, mark evolution aborted, return to complete phase. Support `--force`.
  - `history <feature-id>`: List all versioned baselines with dates and summaries. Support `--json`.

---

## Group 7: Phase Integration

### T-7.1: Extend SpecPhase type [T]
- **File:** `packages/specflow/src/types.ts`
- **Test:** `packages/specflow/tests/evolve/phase.test.ts`
- **Dependencies:** T-1.3
- **Description:** Add `"evolve"` to `SpecPhase` union type. Add phase icon mapping (suggest: circled 8 or refresh symbol). Ensure type guards and validators handle new phase.

### T-7.2: Update status display for evolve phase [T]
- **File:** `packages/specflow/src/commands/status.ts` (or equivalent)
- **Test:** `packages/specflow/tests/evolve/phase.test.ts` (extend)
- **Dependencies:** T-7.1, T-6.8
- **Description:** Update `specflow status` to show evolve-specific info:
  - Current evolution version (baseline → target)
  - Divergence counts if active
  - Evolution progress indicator
  - Phase icon for evolve

### T-7.3: Verify backwards compatibility [T]
- **File:** `packages/specflow/tests/evolve/backwards-compat.test.ts`
- **Test:** (this IS the test)
- **Dependencies:** T-7.2
- **Description:** Create dedicated test suite:
  - Existing `specflow complete` workflow unchanged
  - Features without evolution history work normally
  - Database migration doesn't break existing features
  - Old CLI commands still function

---

## Group 8: Documentation & Polish

### T-8.1: Update documentation
- **File:** `packages/specflow/README.md`
- **File:** `packages/specflow/docs/evolve.md` (new)
- **Test:** none
- **Dependencies:** T-6.8, T-7.2
- **Description:**
  - Add evolve workflow section to README
  - Create `docs/evolve.md` with:
    - Workflow overview
    - Command reference
    - Example session walkthrough
    - Troubleshooting guide
  - Document F-089 interaction rules

### T-8.2: Create E2E test suite [T]
- **File:** `packages/specflow/tests/evolve/e2e.test.ts`
- **Test:** (this IS the test)
- **Dependencies:** T-7.3
- **Description:** Full evolution cycle test:
  1. Create test feature with spec at `complete` phase
  2. Simulate implementation drift (add test files with divergent behavior)
  3. Run full workflow: init → scan → diff → review → apply → complete
  4. Verify:
     - Versioned baseline created
     - Divergences detected
     - Spec updated correctly
     - Feature returns to complete phase
     - History shows evolution record

---

## Execution Order

### Wave 1 (Foundation - No Dependencies)
- T-1.1, T-2.1, T-3.1 can start immediately in parallel

### Wave 2 (Foundation Completion)
- T-1.2 (after T-1.1)
- T-1.3 (after T-1.1, parallel with T-1.2)
- T-2.2 (after T-2.1)

### Wave 3 (Core Data)
- T-1.4 (after T-1.2, T-1.3)
- T-2.3 (after T-2.2, T-1.4)
- T-3.2 (after T-2.1, T-3.1)

### Wave 4 (Scanner & Classifier)
- T-3.3 (after T-3.2)
- T-4.1 (after T-2.1, T-1.3)

### Wave 5 (Scanner Complete & Classifier)
- T-3.4 (after T-3.3)
- T-4.2 (after T-4.1)
- T-4.3 (after T-4.2)

### Wave 6 (Differ)
- T-5.1 (after T-4.1, T-1.4)
- T-5.2 (after T-5.1, T-2.3)

### Wave 7 (CLI - Sequential)
- T-6.1 (after T-1.4, T-2.3)
- T-6.2 (after T-6.1)
- T-6.3 (after T-6.2, T-3.4)
- T-6.4 (after T-6.3, T-4.2, T-5.1)
- T-6.5 (after T-6.4)
- T-6.6 (after T-6.5, T-5.2)
- T-6.7 (after T-6.6)
- T-6.8 (after T-6.2)

### Wave 8 (Integration)
- T-7.1 (after T-1.3)
- T-7.2 (after T-7.1, T-6.8)
- T-7.3 (after T-7.2)

### Wave 9 (Polish)
- T-8.1 (after T-7.2)
- T-8.2 (after T-7.3)

---

## Dependency Graph (Simplified)

```
T-1.1 ──┬── T-1.2 ──┬── T-1.4 ──┬── T-6.1 ── T-6.2 ── T-6.3 ── T-6.4 ── T-6.5 ── T-6.6 ── T-6.7
        │           │           │                       │               │
        └── T-1.3 ──┘           │                       │               │
                    │           │                       │               │
T-2.1 ── T-2.2 ── T-2.3 ────────┘                       │               │
  │                                                     │               │
  └── T-3.2 ── T-3.3 ── T-3.4 ──────────────────────────┘               │
  │                                                                     │
  └── T-4.1 ── T-4.2 ── T-4.3                                           │
        │                                                               │
        └── T-5.1 ── T-5.2 ─────────────────────────────────────────────┘
                                                                        │
T-1.3 ── T-7.1 ── T-7.2 ── T-7.3 ── T-8.2                               │
                    │                                                   │
                    └── T-8.1 ◄─────────────────────────────────────────┘

T-3.1 (parallel, no deps)
T-6.8 (after T-6.2, parallel with T-6.3+)
```

---

## Estimates

| Group | Tasks | Estimated Hours |
|-------|-------|-----------------|
| Foundation | T-1.1 to T-1.4 | 2-3 |
| Baseline | T-2.1 to T-2.3 | 2-3 |
| Scanner | T-3.1 to T-3.4 | 4-5 |
| Classifier | T-4.1 to T-4.3 | 3-4 |
| Differ | T-5.1 to T-5.2 | 2-3 |
| CLI | T-6.1 to T-6.8 | 3-4 |
| Integration | T-7.1 to T-7.3 | 1-2 |
| Polish | T-8.1 to T-8.2 | 1-2 |
| **Total** | **28 tasks** | **18-26 hours** |
