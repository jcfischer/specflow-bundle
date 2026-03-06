# Technical Plan: brownfield-evolve

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLI Layer                                       │
│  specflow evolve {init|scan|diff|review|apply|complete|status|abort|history}│
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Command Handler                                    │
│                     src/commands/evolve.ts                                   │
│  Routes subcommands to appropriate lib functions                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐
│   lib/evolve/       │ │   lib/evolve/       │ │   lib/evolve/       │
│   baseline.ts       │ │   scanner.ts        │ │   classifier.ts     │
│   - snapshot spec   │ │   - parse TS/JS     │ │   - AI diff class.  │
│   - version mgmt    │ │   - extract sigs    │ │   - confidence      │
└─────────────────────┘ │   - test coverage   │ │   - recommendations │
                        └─────────────────────┘ └─────────────────────┘
                                    │                       │
                                    ▼                       ▼
                        ┌─────────────────────────────────────────┐
                        │           lib/evolve/differ.ts          │
                        │   - compare baseline vs implementation  │
                        │   - generate divergence records         │
                        │   - merge approved deltas               │
                        └─────────────────────────────────────────┘
                                            │
                                            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Database Layer                                      │
│              evolution_records + divergences tables                          │
│                      (via lib/database.ts)                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                            │
                                            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          File System                                         │
│   .specify/specs/<feature>/           .specify/evolve/<feature>/             │
│   ├── spec.md (current)               ├── spec.v1.md (baseline)              │
│   ├── plan.md                         ├── spec.working.md (in-progress)      │
│   └── tasks.md                        ├── implementation-snapshot.json       │
│                                       └── divergence-report.json             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Technology Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Runtime | Bun | Project standard, fast startup |
| Database | SQLite + bun:sqlite | Existing pattern, embedded migrations |
| CLI | Commander.js | Project pattern, subcommand support |
| TypeScript Parser | ts-morph | AST analysis for function signatures, exports |
| AI Classification | Claude API via headless spawn | Existing pattern from harden.ts |
| Validation | Zod | Type-safe input validation |
| Test Framework | bun:test | Project standard |

## Data Model

### New Tables (Migration 008)

```sql
-- Evolution state tracking
CREATE TABLE evolution_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feature_id TEXT NOT NULL,
  baseline_version TEXT NOT NULL,        -- e.g., "v1"
  target_version TEXT NOT NULL,          -- e.g., "v1.1"
  status TEXT NOT NULL CHECK(status IN ('active', 'completed', 'aborted')),
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  divergence_summary TEXT,               -- JSON: {total, cosmetic, enhancement, ...}
  FOREIGN KEY (feature_id) REFERENCES features(id)
);

CREATE INDEX idx_evolution_records_feature ON evolution_records(feature_id);
CREATE INDEX idx_evolution_records_status ON evolution_records(status);

-- Individual divergences detected
CREATE TABLE divergences (
  id TEXT PRIMARY KEY,                   -- UUID
  evolution_id INTEGER NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('cosmetic', 'enhancement', 'bugfix', 'drift', 'breaking')),
  severity TEXT NOT NULL CHECK(severity IN ('low', 'medium', 'high')),
  spec_location TEXT,                    -- line reference in baseline spec
  impl_location TEXT,                    -- file:line in codebase
  description TEXT NOT NULL,
  recommendation TEXT CHECK(recommendation IN ('accept', 'reject', 'modify')),
  confidence REAL,                       -- 0.0-1.0
  user_decision TEXT CHECK(user_decision IN ('approved', 'rejected', 'modified')),
  applied_at DATETIME,
  FOREIGN KEY (evolution_id) REFERENCES evolution_records(id)
);

CREATE INDEX idx_divergences_evolution ON divergences(evolution_id);
CREATE INDEX idx_divergences_decision ON divergences(user_decision);
```

### TypeScript Types

```typescript
// src/types.ts additions

export type EvolutionStatus = "active" | "completed" | "aborted";

export type DivergenceCategory =
  | "cosmetic"      // Whitespace, formatting, naming
  | "enhancement"   // New functionality added
  | "bugfix"        // Bug fixes not in original spec
  | "drift"         // Unintentional deviation
  | "breaking";     // Changes that break original contract

export type DivergenceSeverity = "low" | "medium" | "high";

export type DivergenceRecommendation = "accept" | "reject" | "modify";

export type DivergenceDecision = "approved" | "rejected" | "modified";

export interface EvolutionRecord {
  id: number;
  featureId: string;
  baselineVersion: string;
  targetVersion: string;
  status: EvolutionStatus;
  startedAt: Date;
  completedAt: Date | null;
  divergenceSummary: DivergenceSummary | null;
}

export interface DivergenceSummary {
  total: number;
  cosmetic: number;
  enhancement: number;
  bugfix: number;
  drift: number;
  breaking: number;
  approved: number;
  rejected: number;
  pending: number;
}

export interface Divergence {
  id: string;
  evolutionId: number;
  category: DivergenceCategory;
  severity: DivergenceSeverity;
  specLocation: string | null;
  implLocation: string | null;
  description: string;
  recommendation: DivergenceRecommendation | null;
  confidence: number | null;
  userDecision: DivergenceDecision | null;
  appliedAt: Date | null;
}

export interface ImplementationSnapshot {
  featureId: string;
  scannedAt: string;
  files: ScannedFile[];
  exports: ExportedSymbol[];
  testCoverage: TestCoverageInfo | null;
}

export interface ScannedFile {
  path: string;
  functions: FunctionSignature[];
  classes: ClassSignature[];
  exports: string[];
}

export interface FunctionSignature {
  name: string;
  params: string[];
  returnType: string | null;
  async: boolean;
  exported: boolean;
  line: number;
}

export interface ClassSignature {
  name: string;
  methods: FunctionSignature[];
  exported: boolean;
  line: number;
}

export interface ExportedSymbol {
  name: string;
  type: "function" | "class" | "const" | "type" | "interface";
  file: string;
}

export interface TestCoverageInfo {
  testFiles: string[];
  testCount: number;
  passCount: number;
  failCount: number;
}
```

## API Contracts

### Internal Function APIs

```typescript
// lib/evolve/baseline.ts
export function createBaseline(featureId: string): {
  baselinePath: string;
  version: string;
}

export function getNextVersion(currentVersion: string): string;
// "v1" -> "v1.1", "v1.1" -> "v1.2", "v1.9" -> "v2"

export function restoreBaseline(featureId: string): void;
// Abort: copies baseline back to spec.md

// lib/evolve/scanner.ts
export function scanImplementation(
  featureId: string,
  options?: { timeout?: number }
): ImplementationSnapshot;

export function findFeatureFiles(featureId: string): string[];
// Heuristic: spec references, naming conventions, git history

// lib/evolve/classifier.ts
export function classifyDivergences(
  baseline: string,
  snapshot: ImplementationSnapshot,
  options?: { offline?: boolean }
): Promise<Divergence[]>;

// lib/evolve/differ.ts
export function generateDiffReport(
  evolutionId: number
): { markdown: string; json: object };

export function applyApprovedDeltas(
  evolutionId: number
): { applied: number; skipped: number };

export function mergeToSpec(
  featureId: string,
  divergences: Divergence[]
): string; // Returns new spec content
```

### CLI Command Interface

```
specflow evolve init <feature-id>
  Creates versioned baseline, transitions to evolve phase

specflow evolve scan <feature-id>
  Scans implementation, stores snapshot
  Options: --timeout <ms>

specflow evolve diff <feature-id>
  Generates divergence report using AI classification
  Options: --offline (skip AI, heuristic only)

specflow evolve review <feature-id>
  Interactive TUI for approving/rejecting divergences
  Options: --approve-all, --json

specflow evolve apply <feature-id>
  Merges approved deltas into working spec
  Options: --dry-run

specflow evolve complete <feature-id>
  Finalizes new spec version, returns to complete phase
  Options: --force

specflow evolve status [feature-id]
  Shows evolution progress
  Options: --json

specflow evolve abort <feature-id>
  Cancels evolution, restores baseline
  Options: --force

specflow evolve history <feature-id>
  Shows version history for a feature
  Options: --json
```

## Implementation Phases

### Phase 1: Data Layer (Migration + Types)
**Estimated: 2-3 hours**

1. Create migration `008_evolution_tables.sql`
2. Add migration to `embedded.ts`
3. Add new types to `src/types.ts`
4. Add database access functions to `src/lib/database.ts`:
   - `createEvolutionRecord()`
   - `getEvolutionRecord()`
   - `updateEvolutionRecord()`
   - `getActiveEvolution()`
   - `insertDivergence()`
   - `getDivergences()`
   - `updateDivergenceDecision()`
5. Write database tests

### Phase 2: Baseline Management
**Estimated: 2-3 hours**

1. Create `src/lib/evolve/baseline.ts`
2. Implement spec versioning logic:
   - Copy `spec.md` to `spec.v{N}.md`
   - Create `spec.working.md` for evolution
   - Version increment logic (v1 → v1.1 → v1.2 → v2)
3. Implement restore logic for abort
4. Write baseline tests

### Phase 3: Implementation Scanner
**Estimated: 4-5 hours**

1. Create `src/lib/evolve/scanner.ts`
2. Add `ts-morph` dependency
3. Implement file discovery heuristics:
   - Parse spec.md for backtick references
   - Use naming conventions (`feature-name/*.ts`)
   - Check feature metadata for explicit mappings
4. Implement TypeScript/JavaScript AST parsing:
   - Extract function signatures
   - Extract class definitions
   - Extract exports
   - Track line numbers
5. Implement test coverage extraction (parse `bun test --json`)
6. Write scanner tests with fixtures

### Phase 4: AI-Assisted Classifier
**Estimated: 3-4 hours**

1. Create `src/lib/evolve/classifier.ts`
2. Implement Claude API integration (following `harden.ts` pattern)
3. Design classification prompt:
   - Input: baseline spec + implementation snapshot
   - Output: structured divergence list with categories
4. Implement confidence scoring
5. Implement offline fallback (keyword heuristics)
6. Write classifier tests (mock Claude responses)

### Phase 5: Diff Report Generation
**Estimated: 2-3 hours**

1. Create `src/lib/evolve/differ.ts`
2. Implement divergence report generation:
   - Markdown format for humans
   - JSON format for tooling
3. Implement delta application logic:
   - Parse spec structure
   - Insert/modify sections based on divergences
   - Preserve formatting
4. Write differ tests

### Phase 6: CLI Integration
**Estimated: 3-4 hours**

1. Create `src/commands/evolve.ts`
2. Register subcommands in `src/index.ts`
3. Implement each subcommand handler:
   - `init`: validate phase, create baseline, update DB
   - `scan`: run scanner, store snapshot
   - `diff`: run classifier, store divergences, display report
   - `review`: interactive approval (or batch flags)
   - `apply`: merge approved deltas
   - `complete`: finalize version
   - `status`: display progress
   - `abort`: restore baseline
   - `history`: show versions
4. Write CLI integration tests

### Phase 7: Phase Integration
**Estimated: 1-2 hours**

1. Add `evolve` to `SpecPhase` type
2. Update phase icons in status display
3. Update `specflow status` to show evolve state
4. Ensure backwards compatibility with existing complete workflow
5. Document interaction with F-089 lifecycle extension

### Phase 8: Documentation & Polish
**Estimated: 1-2 hours**

1. Update README with evolve workflow
2. Add `docs.md` section for brownfield evolution
3. Add example evolution session to documentation
4. Final test pass

## File Structure

```
packages/specflow/
├── src/
│   ├── index.ts                    # Add evolve command registration
│   ├── types.ts                    # Add evolution types
│   ├── commands/
│   │   └── evolve.ts               # NEW: CLI command handler
│   └── lib/
│       ├── database.ts             # Add evolution DB operations
│       ├── migrations/
│       │   ├── embedded.ts         # Add migration 008
│       │   └── (no new files)
│       └── evolve/                 # NEW: Evolution logic
│           ├── index.ts            # Re-exports
│           ├── baseline.ts         # Spec versioning
│           ├── scanner.ts          # Implementation parsing
│           ├── classifier.ts       # AI divergence classification
│           └── differ.ts           # Report generation & merging
├── migrations/
│   └── 008_evolution_tables.sql    # NEW: Schema migration
└── tests/
    └── evolve/                     # NEW: Test directory
        ├── baseline.test.ts
        ├── scanner.test.ts
        ├── classifier.test.ts
        ├── differ.test.ts
        └── command.test.ts
```

## Dependencies

### New Package Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| ts-morph | ^22.0.0 | TypeScript AST parsing for scanner |
| uuid | ^9.0.0 | Generate divergence IDs (or use crypto.randomUUID) |

### External Service Dependencies

| Service | Required | Fallback |
|---------|----------|----------|
| Claude API | No | Heuristic classification (offline mode) |

### Internal Dependencies

| Module | Depends On |
|--------|------------|
| evolve/baseline.ts | database.ts, fs |
| evolve/scanner.ts | ts-morph, database.ts |
| evolve/classifier.ts | Claude API (spawn), database.ts |
| evolve/differ.ts | baseline.ts, database.ts |
| commands/evolve.ts | All lib/evolve/* modules |

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| ts-morph adds significant bundle size | Medium | High | Consider alternative: TypeScript compiler API directly, or @babel/parser |
| AI classification produces low-quality results | High | Medium | Strong prompt engineering, confidence thresholds, require human review for low-confidence items |
| Spec merging corrupts document structure | High | Medium | Implement conservative merge (add sections, don't modify existing), dry-run mode, backup before apply |
| Feature file discovery is inaccurate | Medium | Medium | Allow explicit file mapping in feature metadata, fallback to manual specification |
| Migration conflicts with existing databases | High | Low | Thorough testing, idempotent migration SQL |
| Evolve conflicts with existing harden/review/approve phases | Medium | Medium | Clear phase transition rules: evolve only from `complete`, returns to `complete` |
| Large codebases timeout during scan | Medium | Medium | Configurable timeout, progressive scanning, file count limits |

## Open Questions Resolution

Based on spec analysis, proposed answers:

1. **How are implementation files associated with a feature?**
   - Primary: Explicit `spec-path` in feature metadata + backtick references in spec.md
   - Secondary: Naming convention heuristic (`packages/**/feature-name/**`)
   - Fallback: Prompt user to specify in `evolve init`

2. **Should diff classification work offline with local LLM fallback?**
   - Yes, implement `--offline` flag
   - Offline mode uses keyword heuristics (regex patterns for common change types)
   - Lower confidence scores for offline classifications

3. **What is the merge strategy when approved deltas conflict?**
   - Apply in order of category priority: bugfix > enhancement > drift > cosmetic
   - For same-category conflicts, apply in detection order
   - Flag conflicts for manual resolution

4. **How does this interact with F-089 lifecycle (harden/review/approve)?**
   - `evolve` phase is independent, only accessible from `complete` status
   - After `evolve complete`, feature returns to `complete` (not harden)
   - If user wants full lifecycle on evolved spec, they run `specflow reset` then proceed

## Success Criteria Mapping

| Spec Criterion | Implementation Verification |
|----------------|----------------------------|
| Snapshot any completed feature spec | `evolve init` creates `spec.vN.md`, test with multiple features |
| Scanner identifies implementation files | Test scanner with known feature, verify file list |
| AI diff produces actionable classifications | Integration test with real Claude, verify JSON structure |
| Approved deltas merge cleanly | Unit test merge logic, verify no corruption |
| Version history preserved | Query `evolution_records`, verify audit trail |
| Backwards compatible | Existing `specflow complete` tests still pass |
| Full cycle works end-to-end | E2E test: init → scan → diff → apply → complete |

## Test Strategy

1. **Unit Tests**: Each lib module in isolation
   - Mock database for baseline.ts
   - Mock ts-morph for scanner.ts
   - Mock Claude API for classifier.ts
   - Fixture-based tests for differ.ts

2. **Integration Tests**: Command handlers with real database
   - Temp database for each test
   - Verify state transitions

3. **E2E Test**: Full evolution cycle
   - Create feature with spec
   - Simulate implementation drift
   - Run full evolve workflow
   - Verify final spec content

4. **Regression Tests**: Ensure existing functionality unaffected
   - Run existing test suite after changes
   - Specific test for `specflow complete` compatibility
