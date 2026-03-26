# Implementation Tasks: F-093 Dolt Backend

## Progress Tracking

| Task | Status | Notes |
|------|--------|-------|
| T-1.1 | ☐ | |
| T-1.2 | ☐ | |
| T-1.3 | ☐ | |
| T-2.1 | ☐ | |
| T-2.2 | ☐ | |
| T-2.3 | ☐ | |
| T-3.1 | ☐ | |
| T-3.2 | ☐ | |
| T-3.3 | ☐ | |
| T-4.1 | ☐ | |
| T-4.2 | ☐ | |
| T-4.3 | ☐ | |
| T-4.4 | ☐ | |
| T-5.1 | ☐ | |
| T-5.2 | ☐ | |
| T-5.3 | ☐ | |
| T-6.1 | ☐ | |
| T-6.2 | ☐ | |
| T-6.3 | ☐ | |
| T-6.4 | ☐ | |
| T-6.5 | ☐ | |
| T-6.6 | ☐ | |
| T-6.7 | ☐ | |
| T-7.1 | ☐ | |
| T-7.2 | ☐ | |
| T-7.3 | ☐ | |
| T-8.1 | ☐ | |
| T-8.2 | ☐ | |
| T-8.3 | ☐ | |
| T-8.4 | ☐ | |

## Group 1: Interface Definition & Type System

### T-1.1: Define DatabaseAdapter interface and types [T]
- **File:** packages/specflow/src/lib/adapters/types.ts
- **Test:** packages/specflow/tests/adapters/types.test.ts
- **Dependencies:** none
- **Description:** Define complete `DatabaseAdapter` interface with all CRUD operations, lifecycle methods, version control operations, and supporting types (`DbConfig`, `VCStatus`, `FeatureFilters`, `FeatureStats`, `NewFeature`, `Feature`, `SpecData`, `SkipReason`, `HardenResult`, `ReviewRecord`, `ApprovalGate`)

### T-1.2: Create adapter factory skeleton [T]
- **File:** packages/specflow/src/lib/adapters/factory.ts
- **Test:** packages/specflow/tests/adapters/factory.test.ts
- **Dependencies:** T-1.1
- **Description:** Implement `createAdapter(projectPath)` factory function with backend selection logic based on config file, including error handling for unknown backends

### T-1.3: Add configuration schema and validation [T]
- **File:** packages/specflow/src/lib/config.ts
- **Test:** packages/specflow/tests/config.test.ts
- **Dependencies:** T-1.1
- **Description:** Define configuration file schema, implement `loadConfig(projectPath)` function with validation using Zod, handle missing/invalid config with defaults to SQLite

## Group 2: SQLiteAdapter Implementation

### T-2.1: Create SQLiteAdapter class structure [T]
- **File:** packages/specflow/src/lib/adapters/sqlite.ts
- **Test:** packages/specflow/tests/adapters/sqlite.test.ts
- **Dependencies:** T-1.1
- **Description:** Implement `SQLiteAdapter` class skeleton with `connect()` and `disconnect()` methods, instantiate bun:sqlite Database, add WAL mode pragma, implement migration runner integration

### T-2.2: Implement SQLiteAdapter CRUD operations [T]
- **File:** packages/specflow/src/lib/adapters/sqlite.ts
- **Test:** packages/specflow/tests/adapters/sqlite.test.ts
- **Dependencies:** T-2.1
- **Description:** Wrap existing database logic from `src/lib/database.ts` into adapter methods: `createFeature()`, `getFeature()`, `updateFeature()`, `listFeatures()`, `deleteFeature()`, `saveSpecData()`, `getSpecData()`, `addSkipReason()`, `getSkipReason()`, `saveHardenResult()`, `saveReview()`, `saveApproval()`, `getStats()`. All operations wrapped in `Promise.resolve()`

### T-2.3: Add no-op version control methods to SQLiteAdapter [T]
- **File:** packages/specflow/src/lib/adapters/sqlite.ts
- **Test:** packages/specflow/tests/adapters/sqlite.test.ts
- **Dependencies:** T-2.2
- **Description:** Implement version control methods as no-ops: `init()`, `status()` (returns `{ clean: true }`), `commit()`, `push()`, `pull()`. These methods do nothing for SQLite backend

## Group 3: Async Conversion Across Codebase

### T-3.1: Convert database module to async [T]
- **File:** packages/specflow/src/lib/database.ts
- **Test:** packages/specflow/tests/database.test.ts
- **Dependencies:** T-2.2, T-1.2
- **Description:** Replace direct bun:sqlite usage with adapter factory, export adapter instance, convert all function signatures to async, update internal function calls to use `await`

### T-3.2: Convert command handlers to async [T] [P]
- **Files:** packages/specflow/src/commands/*.ts (specify.ts, plan.ts, tasks.ts, implement.ts, test.ts, harden.ts, review.ts, approve.ts, list.ts, status.ts)
- **Test:** packages/specflow/tests/commands/*.test.ts
- **Dependencies:** T-3.1
- **Description:** Add `async` to all command handler functions, add `await` to all database calls, ensure error propagation works correctly, update tests to be async

### T-3.3: Convert phase executors to async [T] [P with T-3.2]
- **Files:** packages/specflow/src/lib/phases/*.ts
- **Test:** packages/specflow/tests/phases/*.test.ts
- **Dependencies:** T-3.1
- **Description:** Add `async/await` to phase logic functions, ensure phase state transitions remain atomic, update tests to be async

## Group 4: DoltAdapter Implementation

### T-4.1: Create DoltAdapter class with connection management [T]
- **File:** packages/specflow/src/lib/adapters/dolt.ts
- **Test:** packages/specflow/tests/adapters/dolt.test.ts
- **Dependencies:** T-1.1
- **Description:** Implement `DoltAdapter` class with `connect()` using mysql2.createConnection(), add connection ping test, implement `disconnect()`, add Dolt CLI detection (`which dolt`), throw clear error if Dolt not installed

### T-4.2: Implement DoltAdapter CRUD operations [T]
- **File:** packages/specflow/src/lib/adapters/dolt.ts
- **Test:** packages/specflow/tests/adapters/dolt.test.ts
- **Dependencies:** T-4.1
- **Description:** Implement all CRUD operations using mysql2 parameterized queries: `createFeature()`, `getFeature()`, `updateFeature()`, `listFeatures()`, `deleteFeature()`, `saveSpecData()`, `getSpecData()`, `addSkipReason()`, `getSkipReason()`, `saveHardenResult()`, `saveReview()`, `saveApproval()`, `getStats()`. Handle timestamp conversion (ISO 8601 string ↔ MySQL DATETIME)

### T-4.3: Add migration support for DoltAdapter [T]
- **File:** packages/specflow/src/lib/adapters/dolt.ts, packages/specflow/src/lib/migrations/runner.ts, packages/specflow/src/lib/migrations/embedded.ts
- **Test:** packages/specflow/tests/adapters/dolt.test.ts
- **Dependencies:** T-4.1
- **Description:** Create MySQL DDL versions of all migrations, implement async migration runner that detects backend and executes correct DDL, ensure schema version tracking works for both backends

### T-4.4: Implement DoltAdapter version control methods [T]
- **File:** packages/specflow/src/lib/adapters/dolt.ts
- **Test:** packages/specflow/tests/adapters/dolt.test.ts
- **Dependencies:** T-4.1
- **Description:** Implement version control operations by shelling out to Dolt CLI: `init()` (dolt init + remote add), `status()` (parse dolt status --json), `commit()` (dolt add . && dolt commit), `push()` (dolt push), `pull()` (dolt pull). Add error handling for CLI failures

## Group 5: Configuration & Factory Integration

### T-5.1: Integrate adapter factory with database module [T]
- **File:** packages/specflow/src/lib/database.ts
- **Test:** packages/specflow/tests/database.test.ts
- **Dependencies:** T-1.2, T-2.3, T-4.4
- **Description:** Replace initialization logic with adapter factory call, pass projectPath to factory, handle adapter creation errors, ensure backward compatibility with existing code

### T-5.2: Add config file generation on init [T]
- **File:** packages/specflow/src/commands/init.ts
- **Test:** packages/specflow/tests/commands/init.test.ts
- **Dependencies:** T-1.3, T-5.1
- **Description:** Generate default `.specflow/config.json` with SQLite backend when initializing new project, detect existing config and preserve it, add `--backend` flag to choose backend during init

### T-5.3: Add config migration for existing projects [T]
- **File:** packages/specflow/src/lib/config.ts
- **Test:** packages/specflow/tests/config.test.ts
- **Dependencies:** T-1.3, T-5.1
- **Description:** Detect missing config file, generate default SQLite config automatically, ensure existing projects continue working without changes, log warning when auto-generating config

## Group 6: CLI Commands for Version Control

### T-6.1: Create dolt init command [T]
- **File:** packages/specflow/src/commands/dolt/init.ts
- **Test:** packages/specflow/tests/commands/dolt/init.test.ts
- **Dependencies:** T-4.4, T-5.1
- **Description:** Implement `specflow dolt init --remote <url>` command, check backend is Dolt (error if SQLite), call adapter `init()` method, update config file with remote URL, provide clear success/failure messages

### T-6.2: Create dolt status command [T]
- **File:** packages/specflow/src/commands/dolt/status.ts
- **Test:** packages/specflow/tests/commands/dolt/status.test.ts
- **Dependencies:** T-4.4, T-5.1
- **Description:** Implement `specflow dolt status` command, check backend is Dolt, call adapter `status()` method, format output showing uncommitted changes, branch info, ahead/behind counts

### T-6.3: Create dolt commit command [T]
- **File:** packages/specflow/src/commands/dolt/commit.ts
- **Test:** packages/specflow/tests/commands/dolt/commit.test.ts
- **Dependencies:** T-4.4, T-5.1
- **Description:** Implement `specflow dolt commit -m <message>` command, check backend is Dolt, validate message provided, call adapter `commit()` method, show commit success message

### T-6.4: Create dolt push command [T]
- **File:** packages/specflow/src/commands/dolt/push.ts
- **Test:** packages/specflow/tests/commands/dolt/push.test.ts
- **Dependencies:** T-4.4, T-5.1
- **Description:** Implement `specflow dolt push [remote]` command, check backend is Dolt, default remote to "origin", call adapter `push()` method, show push progress and success message

### T-6.5: Create dolt pull command [T]
- **File:** packages/specflow/src/commands/dolt/pull.ts
- **Test:** packages/specflow/tests/commands/dolt/pull.test.ts
- **Dependencies:** T-4.4, T-5.1
- **Description:** Implement `specflow dolt pull [remote]` command, check backend is Dolt, default remote to "origin", call adapter `pull()` method, show pull progress and success message, handle conflicts gracefully

### T-6.6: Create dolt log command [T]
- **File:** packages/specflow/src/commands/dolt/log.ts
- **Test:** packages/specflow/tests/commands/dolt/log.test.ts
- **Dependencies:** T-4.4, T-5.1
- **Description:** Implement `specflow dolt log [-n <count>]` command, shell out to `dolt log --oneline`, format commit history output, add option to limit number of commits shown

### T-6.7: Create dolt diff command [T]
- **File:** packages/specflow/src/commands/dolt/diff.ts
- **Test:** packages/specflow/tests/commands/dolt/diff.test.ts
- **Dependencies:** T-4.4, T-5.1
- **Description:** Implement `specflow dolt diff [commit]` command, shell out to `dolt diff`, format diff output showing table changes, default to diff against HEAD if no commit specified

## Group 7: Migration Tool

### T-7.1: Create migration tool command structure [T]
- **File:** packages/specflow/src/commands/migrate.ts
- **Test:** packages/specflow/tests/commands/migrate.test.ts
- **Dependencies:** T-5.1
- **Description:** Implement `specflow migrate sqlite-to-dolt` command with options (--sqlite-path, --dolt-database, --dolt-remote, --dry-run, --no-data, --skip-verification), add command line parsing and validation

### T-7.2: Implement migration workflow logic [T]
- **File:** packages/specflow/src/commands/migrate.ts, packages/specflow/src/lib/migration/sqlite-to-dolt.ts
- **Test:** packages/specflow/tests/migration/sqlite-to-dolt.test.ts
- **Dependencies:** T-7.1, T-4.3
- **Description:** Implement 10-step migration workflow: (1) backup SQLite, (2) export schema, (3) convert to MySQL DDL, (4) dolt init, (5) apply schema, (6) export data, (7) transform timestamps, (8) import to Dolt, (9) verify row counts, (10) update config + commit. Add progress indicators for each step

### T-7.3: Add rollback and verification logic [T]
- **File:** packages/specflow/src/lib/migration/sqlite-to-dolt.ts
- **Test:** packages/specflow/tests/migration/sqlite-to-dolt.test.ts
- **Dependencies:** T-7.2
- **Description:** Implement rollback mechanism on failure (restore SQLite config, preserve original database), add row count verification, add checksum verification for data integrity, implement --dry-run preview mode

## Group 8: Testing & Documentation

### T-8.1: Create shared adapter test suite [T]
- **File:** packages/specflow/tests/adapters/shared.test.ts
- **Test:** (self-testing)
- **Dependencies:** T-2.3, T-4.4
- **Description:** Create comprehensive test suite that tests DatabaseAdapter interface contract, run same tests against both SQLiteAdapter and DoltAdapter, test all CRUD operations, test edge cases (null values, empty results, long strings), test error handling

### T-8.2: Create integration tests [T]
- **File:** packages/specflow/tests/integration/dolt-workflow.test.ts, packages/specflow/tests/integration/migration.test.ts, packages/specflow/tests/integration/multi-developer.test.ts
- **Test:** (self-testing)
- **Dependencies:** T-6.7, T-7.3
- **Description:** Test full workflows: (1) init → specify → commit → push → pull cycle, (2) SQLite → Dolt migration with data verification, (3) two Dolt instances syncing via DoltHub, (4) offline fallback (switch to SQLite and back)

### T-8.3: Add performance benchmarks [T]
- **File:** packages/specflow/tests/benchmarks/adapter-performance.test.ts
- **Test:** (self-testing)
- **Dependencies:** T-8.1
- **Description:** Benchmark common operations (createFeature, getFeature, listFeatures, updateFeature) for both adapters, verify Dolt latency < 2x SQLite, test with 100+ features, document results

### T-8.4: Create documentation [T]
- **Files:**
  - docs/setup/dolt-installation.md
  - docs/setup/backend-configuration.md
  - docs/setup/dolthub-account.md
  - docs/guides/sqlite-to-dolt-migration.md
  - docs/guides/version-control-workflow.md
  - docs/guides/multi-developer-setup.md
  - docs/guides/offline-fallback.md
  - docs/api/database-adapter.md
  - docs/api/configuration-schema.md
  - docs/troubleshooting/common-errors.md
  - docs/troubleshooting/performance-tuning.md
- **Test:** Manual review
- **Dependencies:** T-7.3, T-6.7
- **Description:** Write complete documentation covering setup (Dolt installation, DoltHub account, configuration), migration guide (step-by-step with screenshots), usage guide (version control workflows, multi-developer coordination), API documentation (interface definitions, configuration schema), troubleshooting (common errors, performance tuning)

## Execution Order

### Phase 1: Foundation (can parallelize within phase)
1. T-1.1 (interface definitions - no deps)
2. T-1.2, T-1.3 (parallel - both depend on T-1.1)

### Phase 2: SQLite Adapter (sequential within adapter)
3. T-2.1 (adapter structure - depends on T-1.1)
4. T-2.2 (CRUD operations - depends on T-2.1)
5. T-2.3 (version control no-ops - depends on T-2.2)

### Phase 3: Async Conversion (parallel after SQLite adapter done)
6. T-3.1 (database module - depends on T-2.2, T-1.2)
7. T-3.2, T-3.3 (parallel - both depend on T-3.1)

### Phase 4: Dolt Adapter (sequential within adapter)
8. T-4.1 (connection management - depends on T-1.1)
9. T-4.2 (CRUD operations - depends on T-4.1)
10. T-4.3 (migrations - depends on T-4.1)
11. T-4.4 (version control - depends on T-4.1)

### Phase 5: Integration (sequential, builds on both adapters)
12. T-5.1 (factory integration - depends on T-1.2, T-2.3, T-4.4)
13. T-5.2 (init command - depends on T-1.3, T-5.1)
14. T-5.3 (config migration - depends on T-1.3, T-5.1)

### Phase 6: CLI Commands (parallel after factory integration)
15. T-6.1, T-6.2, T-6.3, T-6.4, T-6.5, T-6.6, T-6.7 (all parallel - depend on T-4.4, T-5.1)

### Phase 7: Migration Tool (sequential after CLI commands)
16. T-7.1 (command structure - depends on T-5.1)
17. T-7.2 (workflow logic - depends on T-7.1, T-4.3)
18. T-7.3 (rollback and verification - depends on T-7.2)

### Phase 8: Testing & Documentation (parallel after all features complete)
19. T-8.1 (shared tests - depends on T-2.3, T-4.4)
20. T-8.2 (integration tests - depends on T-6.7, T-7.3)
21. T-8.3 (benchmarks - depends on T-8.1)
22. T-8.4 (documentation - depends on T-7.3, T-6.7)

## Dependencies

**External packages to add:**
```bash
bun add mysql2
bun add -d @types/node
```

**External tools required:**
- Dolt CLI >= 1.0.0 (installation: https://docs.dolthub.com/introduction/installation)
- DoltHub account (free tier: https://www.dolthub.com/)

## Summary

- **Total tasks:** 32
- **Parallelizable tasks:** 9 (T-1.2/T-1.3, T-3.2/T-3.3, T-6.1-T-6.7, T-8.1-T-8.4)
- **Critical path:** T-1.1 → T-2.1 → T-2.2 → T-2.3 → T-3.1 → T-3.2 → T-4.1 → T-4.2 → T-4.4 → T-5.1 → T-6.1 → T-7.1 → T-7.2 → T-7.3 → T-8.2
- **Estimated total time:** 60-80 hours
- **Phases:** 8 distinct implementation phases with clear dependencies
