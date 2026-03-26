# Technical Plan: F-093 Dolt Backend

## Architecture Overview

The Dolt backend feature introduces a pluggable database architecture using the adapter pattern. This allows SpecFlow to support both SQLite (existing, local-first) and Dolt (new, collaborative, versioned) backends through a unified interface.

```
┌──────────────────────────────────────────────────────────────┐
│                      SpecFlow CLI                             │
│  (specify, plan, tasks, implement, harden, review, approve)  │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     │ async operations
                     ▼
         ┌───────────────────────┐
         │  DatabaseAdapter      │  ← Interface
         │  (interface)          │
         └───────┬───────────────┘
                 │
       ┌─────────┴─────────┐
       │                   │
       ▼                   ▼
┌──────────────┐    ┌──────────────┐
│ SQLiteAdapter│    │ DoltAdapter  │
└──────┬───────┘    └──────┬───────┘
       │                   │
       │                   │
       ▼                   ▼
┌──────────────┐    ┌──────────────┐
│  bun:sqlite  │    │   mysql2     │
│  (local DB)  │    │ (MySQL wire) │
└──────────────┘    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  Dolt CLI    │
                    │ (VC ops)     │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  DoltHub     │
                    │ (remote)     │
                    └──────────────┘

┌────────────────────────────────────────┐
│  Configuration (.specflow/config.json) │
│  • backend: "sqlite" | "dolt"          │
│  • connection params                   │
└────────────────────────────────────────┘
```

**Key components:**

1. **DatabaseAdapter interface**: Defines all database operations (CRUD, stats, lifecycle) with async signatures
2. **SQLiteAdapter**: Wraps existing bun:sqlite code in adapter interface (minimal changes)
3. **DoltAdapter**: New implementation using mysql2 client for SQL + Dolt CLI for version control
4. **Adapter Factory**: Creates appropriate adapter based on config file
5. **Configuration**: `.specflow/config.json` selects backend and provides connection params
6. **CLI Extensions**: New `specflow dolt` subcommands for version control operations

**Data flow:**

- CLI commands → DatabaseAdapter methods (async) → concrete adapter → database backend
- Version control operations → DoltAdapter → Dolt CLI → DoltHub remote
- Configuration → Factory → Adapter selection at startup

## Technology Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Interface Language** | TypeScript | Existing SpecFlow codebase standard |
| **SQLite Client** | bun:sqlite | Already in use, fast synchronous API, wrappable with Promise.resolve() |
| **MySQL Client** | mysql2 | Industry standard, full MySQL protocol support, promise-based API, Dolt compatible |
| **Version Control** | Dolt CLI | Git-like commands (init/commit/push/pull), required for DoltHub integration |
| **Remote Sync** | DoltHub | Centralized Dolt repository hosting (analogous to GitHub for databases) |
| **Config Format** | JSON | Simple, readable, standard for .specflow directory |
| **Migration Tool** | Custom CLI | Integrated into specflow command structure for consistency |
| **Testing** | Existing test suite | Extend current tests to run against both adapters |

**Version requirements:**

- Node/Bun: >= 1.0 (for mysql2 compatibility)
- Dolt CLI: >= 1.0 (stable release)
- mysql2: ^3.0.0 (latest stable)

**Why mysql2 over alternatives:**

- mysql (older package): Less active maintenance
- promise-mysql: Deprecated, recommends mysql2
- mysql2: Active development, native promise support, better performance

**Why Dolt CLI over embedded mode:**

- Dolt CLI provides version control commands (commit, push, pull) not available through SQL interface
- DoltHub integration requires CLI for authentication
- SQL-only mode would require reimplementing git-like workflows
- CLI can be optional dependency (only needed for Dolt backend)

## Data Model

### Database Schema

**Current SQLite schema** (from packages/specflow/src/lib/database.ts):

```sql
-- Core features table
CREATE TABLE features (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  current_phase TEXT,
  -- ... additional columns
);

-- Skip registry
CREATE TABLE skip_registry (
  feature_id TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  FOREIGN KEY (feature_id) REFERENCES features(id)
);

-- Spec data
CREATE TABLE spec_data (
  feature_id TEXT PRIMARY KEY,
  interview_data TEXT NOT NULL,  -- JSON
  timestamp TEXT NOT NULL,
  FOREIGN KEY (feature_id) REFERENCES features(id)
);

-- Harden results
CREATE TABLE harden_results (
  feature_id TEXT PRIMARY KEY,
  results TEXT NOT NULL,  -- JSON
  timestamp TEXT NOT NULL,
  FOREIGN KEY (feature_id) REFERENCES features(id)
);

-- Reviews
CREATE TABLE reviews (
  feature_id TEXT PRIMARY KEY,
  review_data TEXT NOT NULL,  -- JSON
  timestamp TEXT NOT NULL,
  FOREIGN KEY (feature_id) REFERENCES features(id)
);

-- Approvals
CREATE TABLE approvals (
  feature_id TEXT PRIMARY KEY,
  approval_data TEXT NOT NULL,  -- JSON
  timestamp TEXT NOT NULL,
  FOREIGN KEY (feature_id) REFERENCES features(id)
);
```

### Type Mappings

SQLite → MySQL/Dolt conversions:

| SQLite Type | MySQL/Dolt Type | Notes |
|-------------|-----------------|-------|
| TEXT (short) | VARCHAR(255) | Feature IDs, names, status enums |
| TEXT (long) | TEXT | Descriptions, JSON blobs |
| TEXT (timestamp) | DATETIME | ISO 8601 strings → native datetime |
| INTEGER | INT | Phase numbers, counts |
| INTEGER (big) | BIGINT | If needed for future timestamps |
| REAL | DOUBLE | If numeric scores added later |
| BLOB | BLOB | If binary data added later |

**Critical: Timestamp handling**

SQLite stores timestamps as TEXT (ISO 8601 strings like `2024-03-20T14:30:00.000Z`).
MySQL/Dolt should use DATETIME type for proper sorting and querying.

**Adapter serialization strategy:**

- SQLiteAdapter: Keep as TEXT (no changes to existing code)
- DoltAdapter: Convert ISO 8601 string ↔ DATETIME on read/write
  - Write: Parse ISO string → MySQL DATETIME
  - Read: Format DATETIME → ISO string (for TypeScript compatibility)

**Example conversion:**

```typescript
// DoltAdapter write
const created_at = new Date(feature.created_at); // ISO string → Date
await connection.execute(
  "INSERT INTO features (created_at) VALUES (?)",
  [created_at] // mysql2 auto-converts Date → DATETIME
);

// DoltAdapter read
const [rows] = await connection.execute("SELECT created_at FROM features");
const created_at = rows[0].created_at.toISOString(); // DATETIME → ISO string
```

### Schema Migration Process

**Phase 1: Export SQLite schema**

```bash
sqlite3 .specflow/features.db .schema > /tmp/schema.sql
```

**Phase 2: Convert to MySQL**

Transform SQLite schema to MySQL-compatible:
- TEXT → VARCHAR(255) or TEXT (based on usage)
- TEXT timestamp columns → DATETIME
- Remove SQLite-specific pragmas
- Adjust foreign key syntax if needed

**Phase 3: Apply to Dolt**

```bash
dolt sql < /tmp/schema-mysql.sql
```

**Phase 4: Data migration** (optional)

Export SQLite data:
```bash
sqlite3 .specflow/features.db <<EOF
.mode insert features
.output /tmp/features.sql
SELECT * FROM features;
.output stdout
EOF
```

Transform timestamp fields and import to Dolt.

**Schema evolution:**

Future migrations must work with both backends:
- Migration files in `lib/migrations/` generate both SQLite and MySQL DDL
- Test suite runs migrations against both adapters
- Adapter interface may need `getMigrationDialect()` method to generate correct SQL

## API Contracts

### DatabaseAdapter Interface

```typescript
/**
 * Database adapter interface
 * All database operations go through this interface
 */
export interface DatabaseAdapter {
  // ============================================
  // Connection Lifecycle
  // ============================================

  /**
   * Connect to database with adapter-specific config
   * Must be called before any operations
   */
  connect(config: DbConfig): Promise<void>;

  /**
   * Disconnect from database
   * Clean up connections, close handles
   */
  disconnect(): Promise<void>;

  // ============================================
  // Feature CRUD Operations
  // ============================================

  /**
   * Create a new feature
   * @throws if feature with same ID exists
   */
  createFeature(feature: NewFeature): Promise<void>;

  /**
   * Get feature by ID
   * @returns Feature or null if not found
   */
  getFeature(id: string): Promise<Feature | null>;

  /**
   * Update feature fields
   * @throws if feature not found
   */
  updateFeature(id: string, updates: Partial<Feature>): Promise<void>;

  /**
   * List features with optional filters
   * @returns Array of matching features
   */
  listFeatures(filters?: FeatureFilters): Promise<Feature[]>;

  /**
   * Delete feature by ID
   * @throws if feature not found
   */
  deleteFeature(id: string): Promise<void>;

  // ============================================
  // Spec Data Operations
  // ============================================

  /**
   * Save interview data from SPECIFY phase
   */
  saveSpecData(featureId: string, data: SpecData): Promise<void>;

  /**
   * Get spec data for feature
   * @returns SpecData or null if not found
   */
  getSpecData(featureId: string): Promise<SpecData | null>;

  // ============================================
  // Skip Registry Operations
  // ============================================

  /**
   * Add skip reason for feature
   */
  addSkipReason(featureId: string, reason: SkipReason): Promise<void>;

  /**
   * Get skip reason for feature
   * @returns SkipReason or null if not skipped
   */
  getSkipReason(featureId: string): Promise<SkipReason | null>;

  // ============================================
  // Extended Lifecycle Operations
  // ============================================

  /**
   * Save test results from HARDEN phase
   */
  saveHardenResult(featureId: string, result: HardenResult): Promise<void>;

  /**
   * Save review record from REVIEW phase
   */
  saveReview(featureId: string, review: ReviewRecord): Promise<void>;

  /**
   * Save approval gate from APPROVE phase
   */
  saveApproval(featureId: string, approval: ApprovalGate): Promise<void>;

  // ============================================
  // Stats and Queries
  // ============================================

  /**
   * Get aggregate statistics
   * @returns Counts by status, phase, etc.
   */
  getStats(): Promise<FeatureStats>;

  // ============================================
  // Version Control Operations (Optional)
  // Dolt-specific, no-op for SQLite
  // ============================================

  /**
   * Initialize version control for database
   * Dolt: dolt init + remote setup
   * SQLite: no-op
   */
  init?(): Promise<void>;

  /**
   * Get version control status
   * Dolt: uncommitted changes, branch info
   * SQLite: { clean: true }
   */
  status?(): Promise<VCStatus>;

  /**
   * Commit changes to version control
   * Dolt: dolt add . && dolt commit
   * SQLite: no-op
   */
  commit?(message: string): Promise<void>;

  /**
   * Push commits to remote
   * Dolt: dolt push origin
   * SQLite: no-op
   */
  push?(remote: string): Promise<void>;

  /**
   * Pull commits from remote
   * Dolt: dolt pull origin
   * SQLite: no-op
   */
  pull?(remote: string): Promise<void>;
}
```

### Configuration Types

```typescript
/**
 * Database configuration
 */
export interface DbConfig {
  backend: 'sqlite' | 'dolt';
  sqlite?: {
    path: string; // e.g., ".specflow/features.db"
  };
  dolt?: {
    host?: string; // default "localhost"
    port?: number; // default 3306
    user?: string; // default "root"
    password?: string; // default ""
    database: string; // e.g., "specflow_features"
    remote?: string; // DoltHub remote, e.g., "dolthub-org/project"
  };
}

/**
 * Version control status
 */
export interface VCStatus {
  clean: boolean;
  uncommittedChanges?: string[]; // Table names with changes
  branch?: string;
  remote?: string;
  ahead?: number; // Commits ahead of remote
  behind?: number; // Commits behind remote
}
```

### Adapter Factory

```typescript
/**
 * Create database adapter based on configuration
 * @param projectPath - Path to SpecFlow project root
 * @returns Initialized DatabaseAdapter
 */
export async function createAdapter(projectPath: string): Promise<DatabaseAdapter> {
  const config = loadConfig(projectPath); // From .specflow/config.json

  switch (config.database.backend) {
    case 'dolt': {
      const adapter = new DoltAdapter();
      await adapter.connect(config.database.dolt!);
      return adapter;
    }

    case 'sqlite':
    default: {
      const adapter = new SQLiteAdapter();
      await adapter.connect({ path: config.database.sqlite!.path });
      return adapter;
    }
  }
}
```

## Implementation Phases

### Phase 1: Interface Definition & Type System (2-4 hours)

**Goal:** Define DatabaseAdapter interface and configuration types

**Tasks:**
1. Create `src/lib/adapters/types.ts` with:
   - `DatabaseAdapter` interface (all methods)
   - `DbConfig` type
   - `VCStatus` type
   - Adapter-specific config types
2. Create `src/lib/adapters/factory.ts` skeleton
3. Update `src/types.ts` to export adapter types
4. Add configuration schema validation

**Deliverables:**
- Type definitions compile
- No implementation yet (just interfaces)
- Documentation comments on all interface methods

**Verification:**
```bash
bun run tsc --noEmit # Type check passes
```

### Phase 2: SQLiteAdapter Implementation (4-6 hours)

**Goal:** Wrap existing SQLite code in DatabaseAdapter interface

**Tasks:**
1. Create `src/lib/adapters/sqlite.ts`
2. Instantiate `Database` from bun:sqlite in `connect()`
3. Wrap existing database functions from `src/lib/database.ts`:
   - All synchronous operations → `Promise.resolve()`
   - Keep exact same logic
   - Move code from database.ts into adapter methods
4. Implement no-op version control methods:
   - `init()`, `status()`, `commit()`, `push()`, `pull()` return immediately
5. Run existing test suite against SQLiteAdapter

**Deliverables:**
- SQLiteAdapter class implementing DatabaseAdapter
- All existing database operations work through adapter
- Test suite passes (100% parity with current code)

**Verification:**
```bash
bun test packages/specflow/tests/database.test.ts
```

**Critical decisions:**
- Migration handling: Move `runMigrations()` into adapter `connect()` method
- Connection lifecycle: Ensure `disconnect()` closes SQLite connection properly

### Phase 3: Async Conversion Across Codebase (8-12 hours)

**Goal:** Convert all database call sites to async/await

**Context:** Currently ~50+ call sites use synchronous database functions. All must become async.

**Tasks:**
1. Update `src/lib/database.ts` module:
   - Export adapter instance instead of raw bun:sqlite
   - Replace all function signatures with async versions
2. Update all command handlers in `src/commands/`:
   - Add `async` to command handler functions
   - Add `await` to all database calls
3. Update phase executors in `src/lib/phases/`:
   - Add `async/await` to phase logic
4. Update tests in `tests/`:
   - All test functions become async
   - Use `await` for database operations
5. Handle error propagation:
   - Ensure async errors bubble up properly
   - No silent failures from forgotten `await`

**Deliverables:**
- All database call sites use `await`
- No synchronous database access remains
- Full test suite passes

**Verification:**
```bash
bun test # All tests pass
grep -r "db\\.get" src/ # Should find only awaited calls
```

**Risk mitigation:**
- Incremental conversion: Start with one command, verify, then continue
- Transaction semantics: Ensure async doesn't break atomic operations
- Error handling: Test that async errors propagate to CLI error handler

### Phase 4: DoltAdapter Implementation (12-16 hours)

**Goal:** Implement DatabaseAdapter using mysql2 + Dolt CLI

**Tasks:**
1. Create `src/lib/adapters/dolt.ts`
2. Implement `connect()`:
   - Use mysql2.createConnection() with config params
   - Test connection with ping query
   - Run migrations (need MySQL DDL versions)
3. Implement CRUD operations:
   - Use parameterized queries (`connection.execute()`)
   - Handle timestamp conversion (ISO string ↔ DATETIME)
   - Match SQLite semantics exactly
4. Implement version control methods:
   - `init()`: Shell out to `dolt init`, `dolt remote add`
   - `status()`: Parse `dolt status --json`
   - `commit()`: Shell out to `dolt add . && dolt commit -m`
   - `push()`: Shell out to `dolt push origin`
   - `pull()`: Shell out to `dolt pull origin`
5. Add Dolt CLI detection:
   - Check `which dolt` in `connect()`
   - Throw clear error if not installed
6. Test against Dolt database:
   - Spin up local `dolt sql-server`
   - Run test suite against DoltAdapter
   - Verify all operations work

**Deliverables:**
- DoltAdapter class implementing DatabaseAdapter
- All CRUD operations working
- Version control commands functional
- Test suite passes (100% parity with SQLiteAdapter)

**Verification:**
```bash
# Start Dolt server
dolt sql-server --host localhost --port 3306 &

# Run tests
SPECFLOW_BACKEND=dolt bun test packages/specflow/tests/database.test.ts

# Test version control
bun run specflow dolt status
```

**Critical decisions:**
- Connection pooling: Start with single connection, add pooling if needed
- Transaction handling: Use mysql2 transactions for atomic operations
- Error messages: Map mysql2 errors to user-friendly messages

### Phase 5: Configuration & Factory (4-6 hours)

**Goal:** Implement config file loading and adapter selection

**Tasks:**
1. Define configuration file format (`.specflow/config.json`)
2. Implement `loadConfig(projectPath)` function
3. Implement adapter factory:
   - Read config
   - Validate backend selection
   - Instantiate correct adapter
   - Handle missing/invalid config
4. Update database initialization:
   - Replace direct bun:sqlite usage with factory
   - Pass projectPath to factory
5. Add config migration for existing projects:
   - Detect missing config
   - Generate default SQLite config
   - Preserve backward compatibility

**Deliverables:**
- Config loading and validation working
- Factory creates correct adapter based on config
- Existing projects work without config file (default to SQLite)
- New projects get config file on init

**Verification:**
```bash
# Test SQLite backend (default)
rm .specflow/config.json
bun run specflow list # Should work

# Test Dolt backend
cat > .specflow/config.json <<EOF
{
  "database": {
    "backend": "dolt",
    "dolt": {
      "host": "localhost",
      "port": 3306,
      "database": "specflow_features"
    }
  }
}
EOF
bun run specflow list # Should use Dolt
```

**Configuration example:**

```json
{
  "database": {
    "backend": "sqlite",
    "sqlite": {
      "path": ".specflow/features.db"
    },
    "dolt": {
      "host": "localhost",
      "port": 3306,
      "user": "root",
      "password": "",
      "database": "specflow_features",
      "remote": "dolthub-org/my-project"
    }
  }
}
```

### Phase 6: CLI Commands for Version Control (6-8 hours)

**Goal:** Add `specflow dolt` subcommands for version control operations

**Tasks:**
1. Create `src/commands/dolt/` directory structure:
   - `init.ts` - Initialize Dolt and remote
   - `status.ts` - Show uncommitted changes
   - `commit.ts` - Commit changes
   - `push.ts` - Push to remote
   - `pull.ts` - Pull from remote
   - `log.ts` - Show commit history
   - `diff.ts` - Show diff between commits
2. Register commands in CLI router
3. Implement each command:
   - Check backend is Dolt (error if SQLite)
   - Call corresponding adapter method
   - Format output for user
4. Add `--help` documentation for each command
5. Test command workflows:
   - Init → commit → push → pull cycle
   - Status shows changes
   - Log shows history

**Deliverables:**
- All `specflow dolt` commands working
- Help text for each command
- Error handling for wrong backend
- User-friendly output formatting

**Verification:**
```bash
# Full workflow
bun run specflow dolt init --remote dolthub-org/test
bun run specflow specify --name "Test Feature"
bun run specflow dolt status # Should show changes
bun run specflow dolt commit -m "Add test feature"
bun run specflow dolt push
bun run specflow dolt log # Should show commit
```

**Command structure:**

| Command | Options | Description |
|---------|---------|-------------|
| `specflow dolt init` | `--remote <url>` | Initialize Dolt database and remote |
| `specflow dolt status` | - | Show uncommitted changes |
| `specflow dolt commit` | `-m <message>` | Commit changes |
| `specflow dolt push` | `[remote]` | Push to remote (default: origin) |
| `specflow dolt pull` | `[remote]` | Pull from remote (default: origin) |
| `specflow dolt log` | `[-n <count>]` | Show commit history |
| `specflow dolt diff` | `[commit]` | Show diff from commit |

### Phase 7: Migration Tool (6-8 hours)

**Goal:** Implement `specflow migrate sqlite-to-dolt` command

**Tasks:**
1. Create `src/commands/migrate.ts`
2. Implement migration workflow:
   - **Step 1:** Backup SQLite database
   - **Step 2:** Export SQLite schema
   - **Step 3:** Convert schema to MySQL DDL
   - **Step 4:** Create Dolt database (`dolt init`)
   - **Step 5:** Apply MySQL schema to Dolt
   - **Step 6:** Export and transform data
   - **Step 7:** Import data to Dolt
   - **Step 8:** Verify row counts match
   - **Step 9:** Update `.specflow/config.json` to use Dolt
   - **Step 10:** Commit initial state to Dolt
3. Add rollback on failure:
   - Restore SQLite config if migration fails
   - Preserve SQLite database
4. Add `--dry-run` flag to preview changes
5. Add progress indicators for long migrations
6. Test with sample databases

**Deliverables:**
- `specflow migrate sqlite-to-dolt` command working
- Data integrity verified (row counts, checksums)
- Rollback on failure
- Progress reporting

**Verification:**
```bash
# Create test database
bun run specflow specify --name "Feature 1"
bun run specflow specify --name "Feature 2"

# Migrate
bun run specflow migrate sqlite-to-dolt \
  --sqlite-path .specflow/features.db \
  --dolt-database specflow_test \
  --dolt-remote dolthub-org/test

# Verify
bun run specflow list # Should show same features
dolt sql -q "SELECT COUNT(*) FROM features" # Should match SQLite count
```

**Migration command options:**

```bash
specflow migrate sqlite-to-dolt \
  --sqlite-path <path>        # Path to SQLite database \
  --dolt-database <name>      # Dolt database name \
  --dolt-remote <url>         # DoltHub remote URL \
  [--dry-run]                 # Preview without changes \
  [--no-data]                 # Schema only, no data \
  [--skip-verification]       # Skip row count checks
```

### Phase 8: Testing & Documentation (8-12 hours)

**Goal:** Comprehensive testing and documentation

**Tasks:**
1. **Test Suite Expansion:**
   - Create shared test suite for DatabaseAdapter interface
   - Run against both SQLiteAdapter and DoltAdapter
   - Test timestamp conversion (DoltAdapter)
   - Test version control operations (DoltAdapter)
   - Test error cases (connection failures, missing Dolt CLI)
   - Test migration tool (various database sizes)
2. **Integration Testing:**
   - Full workflow: init → specify → commit → push → pull
   - Multi-developer scenario (two Dolt instances syncing)
   - Offline fallback (switch to SQLite, switch back)
3. **Documentation:**
   - Setup guide: Installing Dolt, configuring backend
   - Migration guide: Step-by-step SQLite → Dolt
   - Usage guide: Version control workflows
   - Troubleshooting: Common errors and solutions
   - API documentation: DatabaseAdapter interface
4. **Performance Testing:**
   - Benchmark: SQLite vs Dolt for common operations
   - Load test: 100+ features
   - Verify < 2x latency requirement

**Deliverables:**
- Test coverage > 90% for adapter code
- Integration test suite passing
- Complete documentation set
- Performance benchmarks documented

**Verification:**
```bash
# Run all tests
bun test

# Check coverage
bun test --coverage

# Run integration tests
bun test tests/integration/dolt-workflow.test.ts
```

**Documentation structure:**

```
docs/
├── setup/
│   ├── dolt-installation.md
│   ├── backend-configuration.md
│   └── dolthub-account.md
├── guides/
│   ├── sqlite-to-dolt-migration.md
│   ├── version-control-workflow.md
│   ├── multi-developer-setup.md
│   └── offline-fallback.md
├── api/
│   ├── database-adapter.md
│   └── configuration-schema.md
└── troubleshooting/
    ├── common-errors.md
    └── performance-tuning.md
```

## File Structure

```
packages/specflow/
├── src/
│   ├── lib/
│   │   ├── adapters/
│   │   │   ├── types.ts           # NEW - DatabaseAdapter interface
│   │   │   ├── factory.ts         # NEW - Adapter factory
│   │   │   ├── sqlite.ts          # NEW - SQLiteAdapter implementation
│   │   │   └── dolt.ts            # NEW - DoltAdapter implementation
│   │   ├── database.ts            # MODIFIED - Export adapter instead of raw bun:sqlite
│   │   ├── migrations/            # MODIFIED - Support async migrations
│   │   │   ├── runner.ts          # MODIFIED - Async migration runner
│   │   │   └── embedded.ts        # MODIFIED - MySQL DDL versions
│   │   └── config.ts              # NEW - Config loading and validation
│   ├── commands/
│   │   ├── dolt/                  # NEW - Dolt version control commands
│   │   │   ├── init.ts
│   │   │   ├── status.ts
│   │   │   ├── commit.ts
│   │   │   ├── push.ts
│   │   │   ├── pull.ts
│   │   │   ├── log.ts
│   │   │   └── diff.ts
│   │   ├── migrate.ts             # NEW - Migration tool
│   │   ├── specify.ts             # MODIFIED - Async database calls
│   │   ├── plan.ts                # MODIFIED - Async database calls
│   │   └── ...                    # MODIFIED - All commands async
│   ├── types.ts                   # MODIFIED - Export adapter types
│   └── index.ts                   # MODIFIED - Export adapter API
├── tests/
│   ├── adapters/
│   │   ├── sqlite.test.ts         # NEW - SQLiteAdapter tests
│   │   ├── dolt.test.ts           # NEW - DoltAdapter tests
│   │   └── shared.test.ts         # NEW - Shared adapter tests
│   ├── integration/
│   │   ├── dolt-workflow.test.ts  # NEW - Full VC workflow test
│   │   └── migration.test.ts      # NEW - Migration tool test
│   └── database.test.ts           # MODIFIED - Use adapter factory
└── package.json                   # MODIFIED - Add mysql2 dependency

.specflow/
├── config.json                    # NEW - Backend configuration
└── features.db                    # EXISTING - SQLite database (if backend=sqlite)

docs/
├── setup/                         # NEW - Setup documentation
├── guides/                        # NEW - Usage guides
├── api/                           # NEW - API documentation
└── troubleshooting/               # NEW - Troubleshooting guides
```

## Dependencies

### npm Packages

| Package | Version | Purpose |
|---------|---------|---------|
| mysql2 | ^3.9.0 | MySQL client for Dolt connection |
| bun:sqlite | (builtin) | SQLite client (existing) |
| @types/node | ^20.0.0 | TypeScript types for Node.js APIs |

**Installation:**

```bash
bun add mysql2
bun add -d @types/node
```

### External Dependencies

| Dependency | Version | Required For | Installation |
|------------|---------|--------------|--------------|
| Dolt CLI | >= 1.0.0 | DoltAdapter, version control commands | https://docs.dolthub.com/introduction/installation |
| DoltHub Account | - | Remote push/pull | https://www.dolthub.com/ (free tier available) |

**Dolt CLI installation (macOS):**

```bash
brew install dolt
dolt config --global --add user.name "Your Name"
dolt config --global --add user.email "you@example.com"
```

**Dolt CLI installation (Linux):**

```bash
sudo bash -c 'curl -L https://github.com/dolthub/dolt/releases/latest/download/install.sh | sudo bash'
dolt config --global --add user.name "Your Name"
dolt config --global --add user.email "you@example.com"
```

**DoltHub account setup:**

1. Sign up at https://www.dolthub.com/
2. Create organization or personal workspace
3. Generate access token (Settings → Access Tokens)
4. Configure credentials: `dolt login`

### Optional Dependencies

| Tool | Purpose |
|------|---------|
| Dolt SQL Server | Alternative to CLI mode (runs as daemon) |
| Docker | Running Dolt in container for testing |

**Dolt SQL Server mode:**

```bash
# Start server
dolt sql-server --host localhost --port 3306 --user root

# Adapter connects via mysql2 (no CLI overhead)
```

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **Type mapping data corruption** | High | Medium | • Document safe VARCHAR lengths (255 for IDs, TEXT for descriptions)<br>• Add validation in migration tool<br>• Test with edge cases (very long strings, special characters)<br>• Include rollback mechanism |
| **Async refactoring introduces race conditions** | High | Medium | • Incremental conversion with tests at each step<br>• Preserve transaction semantics<br>• Use Promises properly (no forgotten await)<br>• Test concurrent operations |
| **Dolt CLI not installed** | Medium | High | • Clear error message on connect()<br>• Document installation prominently<br>• Add `specflow doctor` command to check prerequisites<br>• SQLite fallback available |
| **Dolt sql-server crashes** | High | Low | • Recommend sql-server mode for production<br>• Add connection retry logic<br>• Document server monitoring<br>• Fallback to CLI mode if server unavailable |
| **Schema drift between backends** | High | Medium | • Run migration tests against both adapters<br>• Use shared schema validation<br>• CI tests both backends<br>• Adapter interface enforces parity |
| **Partial migration failure** | High | Medium | • Transactional migration with rollback<br>• Require backup before migration<br>• Verify row counts match<br>• Preserve SQLite database after migration |
| **DoltHub auth fails** | Medium | High | • Test authentication in `dolt init`<br>• Clear error messages with resolution steps<br>• Document token generation<br>• Support offline work (commit locally, push later) |
| **Performance < 2x SQLite** | Medium | Medium | • Benchmark common operations<br>• Document performance expectations<br>• Optimize queries if needed<br>• Use connection pooling if beneficial |
| **mysql2 incompatible with Bun** | High | Low | • Test mysql2 with Bun before implementation<br>• Check Bun compatibility matrix<br>• Consider alternative clients if needed |
| **Timestamp conversion bugs** | Medium | Medium | • Test timestamp round-trip (write → read → verify)<br>• Test edge cases (min/max dates, leap years)<br>• Use ISO 8601 standard strictly<br>• Add timestamp validation |
| **Version control conflicts** | Medium | High | • Document conflict resolution process<br>• Initially: manual resolution via Dolt CLI<br>• Future: conflict detection in `dolt pull`<br>• Recommend coordination (who modifies what) |
| **Config file missing/invalid** | Low | High | • Default to SQLite if no config<br>• Validate config on load<br>• Clear error messages for invalid config<br>• Generate default config on init |
| **Breaking changes to CLI** | High | Low | • No changes to existing command signatures<br>• New commands are additive (`dolt` subcommands)<br>• Backward compatibility tests |
| **Test suite doesn't catch adapter differences** | High | Medium | • Shared test suite runs against both adapters<br>• Test edge cases (empty results, null values)<br>• Integration tests with full workflows<br>• Manual testing of multi-developer scenarios |

### Risk Mitigation Timeline

**Pre-implementation (Phase 1-2):**
- Validate mysql2 works with Bun
- Test Dolt CLI installation process
- Prototype timestamp conversion logic

**During implementation (Phase 3-7):**
- Incremental async conversion with tests
- Continuous testing against both adapters
- Performance benchmarks at each phase

**Post-implementation (Phase 8):**
- Full integration testing
- Multi-developer scenario testing
- Documentation review with external users

## Additional Considerations

### Dolt SQL Server vs CLI Trade-offs

**Option A: Dolt SQL Server (recommended for teams)**

Pros:
- Lower latency (persistent connection)
- Connection pooling possible
- Better for high-frequency operations
- Standard MySQL protocol

Cons:
- Requires daemon process
- One more thing to monitor
- Port conflict if MySQL already running
- Need to document server setup

**Option B: Dolt CLI (simpler for solo/occasional use)**

Pros:
- No daemon required
- Simpler setup
- One-time operations fine
- Same CLI used for version control

Cons:
- Higher latency (process spawn overhead)
- No connection pooling
- Slower for bulk operations
- Not recommended for production

**Recommendation:**
- Default: Dolt SQL Server mode (document in setup guide)
- Fallback: CLI mode if server not available (detect and switch)
- DoltAdapter should support both modes (config option)

### Conflict Resolution Strategy

**Phase 1 approach (manual):**
- Conflicts detected by `dolt pull`
- Error message directs user to CLI: `dolt conflicts resolve`
- Document conflict resolution in troubleshooting guide
- Recommend coordination to avoid conflicts

**Future enhancement (F-096):**
- Interactive conflict resolution in `specflow dolt pull`
- Show conflicting rows side-by-side
- Allow user to choose version (local, remote, merge)
- Auto-merge non-conflicting changes

### Branch Strategy

**Phase 1 approach (single branch):**
- All work on `main` branch
- Simple mental model
- Works for small teams

**Future enhancement (F-094):**
- Map SpecFlow features to Dolt branches
- Branch per feature: `feature/F-001-user-auth`
- Merge on completion
- Parallel development without conflicts

### Commit Granularity

**Option 1: Auto-commit on phase transitions**
- Pro: Automatic version control
- Pro: Fine-grained history
- Con: Noisy commit log
- Con: May commit incomplete work

**Option 2: Manual commits only**
- Pro: Developers control commit timing
- Pro: Clean commit history
- Con: Easy to forget to commit
- Con: Large commits lose granularity

**Recommendation:**
- Start with manual commits (Phase 1)
- Add auto-commit option later (configurable)
- Default: prompt to commit after major phase (IMPLEMENT, TEST)

### Schema Evolution

**Migration system changes:**

Current: Migrations are synchronous, SQLite-specific
Future: Migrations must be async, support both backends

**Migration file structure:**

```typescript
export interface Migration {
  version: number;
  description: string;
  up: {
    sqlite: string;  // SQLite DDL
    mysql: string;   // MySQL DDL
  };
  down: {
    sqlite: string;
    mysql: string;
  };
}
```

**Migration runner:**
- Detect current backend
- Execute correct DDL
- Verify schema version matches

### Testing Strategy

**Unit tests:**
- SQLiteAdapter: Test all methods in isolation
- DoltAdapter: Test all methods in isolation
- Factory: Test adapter selection logic
- Config: Test loading and validation

**Integration tests:**
- Shared test suite: Both adapters pass same tests
- Migration: Test SQLite → Dolt → verify
- Version control: Test init → commit → push → pull cycle
- Multi-developer: Simulate two developers syncing

**Performance tests:**
- Benchmark: SQLite vs Dolt for common operations
- Load test: 100+ features
- Verify < 2x latency requirement

**Manual testing:**
- Full workflow: Specify → Plan → Implement → Test → Harden → Review → Approve
- Multi-machine: Test DoltHub sync across two machines
- Offline fallback: Test switching backends
- Error scenarios: Missing Dolt, wrong credentials, network issues

### Documentation Requirements

**Setup documentation:**
1. Installing Dolt CLI
2. Creating DoltHub account
3. Configuring backend in config.json
4. Initializing Dolt database
5. Setting up remote

**Migration documentation:**
1. Why migrate (benefits of Dolt)
2. Pre-migration checklist
3. Step-by-step migration process
4. Post-migration verification
5. Rollback if needed

**Usage documentation:**
1. Version control workflow
2. Multi-developer coordination
3. Conflict resolution
4. Offline work and sync
5. Best practices

**API documentation:**
1. DatabaseAdapter interface
2. Configuration schema
3. Adapter implementation guide
4. Testing custom adapters

### Out of Scope (Explicitly)

The following are **not** included in F-093 and should be considered for future features:

- **Dolt branch support**: Single main branch only
- **Automated conflict resolution**: Manual resolution via Dolt CLI
- **Real-time collaboration**: No WebSocket/polling, pull-based sync only
- **Multi-workspace support**: One database per project
- **Schema evolution tracking**: Migrations apply identically to both backends
- **Performance optimization**: Focus on correctness, optimize later
- **GUI for version control**: CLI only
- **Rollback to SQLite**: Migration is one-way
- **Connection pooling**: Single connection per adapter
- **Read replicas**: Single database instance
- **Database backups**: Rely on git-like versioning
- **Access control**: No row-level security
- **Audit logging**: Beyond Dolt's built-in commit history

These may be addressed in follow-up features (F-094 through F-097).

---

**END OF TECHNICAL PLAN**

[PHASE COMPLETE: PLAN]
Feature: F-093
Plan: .specify/specs/f-093-dolt-backend/plan.md
