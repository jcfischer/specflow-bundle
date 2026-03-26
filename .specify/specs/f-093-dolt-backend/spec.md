# F-093: Dolt Backend for Multi-Developer Collaboration

## Problem & Pain

The current SQLite backend (`bun:sqlite`) creates fundamental limitations for multi-developer collaboration:

1. **No multi-developer collaboration** — SQLite is file-based and local-only. Multiple developers cannot work on the same SpecFlow project simultaneously. When developers work on shared projects, they can't see each other's feature additions, spec updates, or phase transitions.

2. **No version control for data** — Changes to feature specs, tasks, and workflow state aren't versioned. There's no way to see who changed what, when, or why. Rolling back mistakes or understanding the evolution of requirements is impossible.

3. **No sync mechanism** — Unlike code (where git provides push/pull), there's no way to share database changes between developers. Each developer maintains their own isolated database state, leading to divergence and conflicts.

4. **Blocks collaboration features** — Features F-091 (TDD traceability) and F-092 (brownfield evolve) assume multi-developer scenarios. Without a collaborative backend, these features can't deliver their full value.

**Why now:** SpecFlow is maturing beyond solo use. The system was designed for team workflows (review gates, approval cycles, multi-phase pipelines), but the SQLite backend prevents teams from actually using these capabilities together. This is the foundational infrastructure needed before building more collaboration features.

## Users & Context

**Primary users:**
- Development teams using SpecFlow to manage feature development across multiple developers
- Individual developers who need to sync SpecFlow state across machines (laptop, desktop, server)
- Technical leads who want to review feature specs and approve gates across team projects

**Usage context:**
- Multiple developers working on the same SpecFlow-managed project repository
- Need to push/pull spec database changes similar to git for code
- Want to see version history for feature specs and workflow state
- May work offline (need fallback to SQLite)
- Want familiar git-like workflows (init, push, pull, status, diff)

**Current workaround:** Developers either:
- Work in isolation (everyone maintains separate SpecFlow databases)
- Commit the `.specflow/` directory to git (not version-controlled, just file snapshots)
- Manually coordinate who's working on which features (error-prone)

## Technical Context

### Existing Systems

**Current SQLite backend:**
- Location: `packages/specflow/src/lib/database.ts`
- Uses `bun:sqlite` for synchronous database operations
- Schema includes: features table, skip_registry, spec_data, harden_results, reviews, approvals
- Migration system: `lib/migrations/` with embedded and pending migrations
- All database operations are synchronous

**Dependencies:**
- CLI commands: specify, plan, tasks, implement, test, harden, review, approve
- Database initialization: `initDatabase(dbPath)`
- Type definitions: `src/types.ts`

### Dolt Integration Points

**Dolt** is MySQL-compatible with git-like versioning:
- SQL interface: drop-in replacement for MySQL client
- Version control: `dolt add`, `dolt commit`, `dolt push`, `dolt pull`
- Remote: DoltHub for centralized sync (like GitHub for databases)
- Branches: support for feature branches (future consideration)

### Data Requirements

All existing SQLite tables and columns must be supported:
- `features` — core feature tracking
- `skip_registry` — feature skip reasons
- `spec_data` — specification discovery interview data
- `harden_results` — test results for HARDEN phase
- `reviews` — REVIEW phase records
- `approvals` — APPROVE phase gates

## Solution

### Component 1: DatabaseAdapter Abstraction

Create a new `DatabaseAdapter` interface that abstracts database operations:

```typescript
interface DatabaseAdapter {
  // Connection lifecycle
  connect(config: DbConfig): Promise<void>;
  disconnect(): Promise<void>;

  // Feature operations (converted to async)
  createFeature(feature: NewFeature): Promise<void>;
  getFeature(id: string): Promise<Feature | null>;
  updateFeature(id: string, updates: Partial<Feature>): Promise<void>;
  listFeatures(filters?: FeatureFilters): Promise<Feature[]>;
  deleteFeature(id: string): Promise<void>;

  // Spec data operations
  saveSpecData(featureId: string, data: SpecData): Promise<void>;
  getSpecData(featureId: string): Promise<SpecData | null>;

  // Skip registry operations
  addSkipReason(featureId: string, reason: SkipReason): Promise<void>;
  getSkipReason(featureId: string): Promise<SkipReason | null>;

  // Extended lifecycle operations
  saveHardenResult(featureId: string, result: HardenResult): Promise<void>;
  saveReview(featureId: string, review: ReviewRecord): Promise<void>;
  saveApproval(featureId: string, approval: ApprovalGate): Promise<void>;

  // Stats and queries
  getStats(): Promise<FeatureStats>;

  // Version control operations (Dolt-specific, no-op for SQLite)
  init?(): Promise<void>;
  status?(): Promise<VCStatus>;
  commit?(message: string): Promise<void>;
  push?(remote: string): Promise<void>;
  pull?(remote: string): Promise<void>;
}
```

### Component 2: SQLiteAdapter (Existing Backend)

Wrap current SQLite implementation in async adapter:

```typescript
class SQLiteAdapter implements DatabaseAdapter {
  private db: Database | null = null;

  async connect(config: { dbPath: string }): Promise<void> {
    this.db = new Database(config.dbPath, { create: true });
    this.db.exec("PRAGMA journal_mode = WAL");
    await this.runMigrations();
  }

  async createFeature(feature: NewFeature): Promise<void> {
    // Existing logic, wrapped in Promise
    return Promise.resolve(
      this.db!.prepare("INSERT INTO features...").run(...)
    );
  }

  // Version control methods are no-ops for SQLite
  async init(): Promise<void> { /* no-op */ }
  async status(): Promise<VCStatus> { return { clean: true }; }
}
```

### Component 3: DoltAdapter (New Backend)

Dolt adapter using MySQL2 client:

```typescript
class DoltAdapter implements DatabaseAdapter {
  private connection: mysql.Connection | null = null;
  private config: DoltConfig;

  async connect(config: DoltConfig): Promise<void> {
    this.connection = await mysql.createConnection({
      host: config.host || 'localhost',
      port: config.port || 3306,
      user: config.user || 'root',
      password: config.password || '',
      database: config.database
    });
    await this.runMigrations();
  }

  async createFeature(feature: NewFeature): Promise<void> {
    await this.connection!.execute(
      "INSERT INTO features (id, name, description, ...) VALUES (?, ?, ?, ...)",
      [feature.id, feature.name, feature.description, ...]
    );
  }

  // Dolt version control operations
  async init(): Promise<void> {
    await exec('dolt init');
    await exec('dolt remote add origin <dolthub-url>');
  }

  async status(): Promise<VCStatus> {
    const result = await exec('dolt status --json');
    return JSON.parse(result);
  }

  async commit(message: string): Promise<void> {
    await exec('dolt add .');
    await exec(`dolt commit -m "${message}"`);
  }

  async push(remote: string = 'origin'): Promise<void> {
    await exec(`dolt push ${remote}`);
  }

  async pull(remote: string = 'origin'): Promise<void> {
    await exec(`dolt pull ${remote}`);
  }
}
```

### Component 4: Adapter Factory & Configuration

Configuration at `.specflow/config.json`:

```json
{
  "database": {
    "backend": "dolt",  // or "sqlite"
    "sqlite": {
      "path": ".specflow/features.db"
    },
    "dolt": {
      "host": "localhost",
      "port": 3306,
      "user": "root",
      "database": "specflow_features",
      "remote": "dolthub-org/specflow-project"
    }
  }
}
```

Factory creates appropriate adapter:

```typescript
export function createAdapter(projectPath: string): Promise<DatabaseAdapter> {
  const config = loadConfig(projectPath);

  switch (config.database.backend) {
    case 'dolt':
      const dolt = new DoltAdapter();
      await dolt.connect(config.database.dolt);
      return dolt;

    case 'sqlite':
    default:
      const sqlite = new SQLiteAdapter();
      await sqlite.connect({ dbPath: config.database.sqlite.path });
      return sqlite;
  }
}
```

### Component 5: CLI Commands for Version Control

New subcommands under `specflow dolt`:

| Command | Description |
|---------|-------------|
| `specflow dolt init` | Initialize Dolt database and remote |
| `specflow dolt status` | Show uncommitted changes |
| `specflow dolt commit -m "msg"` | Commit changes to local Dolt |
| `specflow dolt push` | Push commits to DoltHub |
| `specflow dolt pull` | Pull changes from DoltHub |
| `specflow dolt log` | Show commit history |
| `specflow dolt diff` | Show diff between commits |

These commands only work when backend is configured as `dolt`. For SQLite backend, they report "Version control not available with SQLite backend."

### Component 6: Migration Strategy

**Schema migration:**
1. Export SQLite schema to SQL
2. Apply schema to Dolt database
3. Optionally import existing SQLite data into Dolt

**CLI tool:**
```bash
specflow migrate sqlite-to-dolt \
  --sqlite-path .specflow/features.db \
  --dolt-database specflow_features \
  --dolt-remote dolthub-org/project
```

This:
- Creates Dolt database
- Creates schema from SQLite
- Copies data if requested
- Updates `.specflow/config.json` to use Dolt backend

## User Scenarios

### Scenario 1: Initialize Shared Project

**Given** a SpecFlow project using SQLite
**When** developer runs `specflow dolt init --remote dolthub-org/project`
**Then**
- Dolt database is initialized
- Schema is created from existing SQLite
- Remote is configured
- `.specflow/config.json` is updated to use Dolt backend
- Developer can push initial state with `specflow dolt push`

### Scenario 2: Clone Project State

**Given** a teammate has pushed SpecFlow state to DoltHub
**When** new developer clones the code repo and runs `specflow dolt pull`
**Then**
- Dolt pulls database state from DoltHub
- Developer sees all existing features and their current phases
- Developer can begin working with shared state

### Scenario 3: Sync Changes

**Given** developer A creates a new feature spec (F-100)
**When** developer A runs `specflow dolt commit -m "Add F-100" && specflow dolt push`
**And** developer B runs `specflow dolt pull`
**Then**
- Developer B sees F-100 in their local database
- Both developers have synchronized feature state

### Scenario 4: Offline Work with SQLite Fallback

**Given** developer is working offline
**When** developer changes backend config to `sqlite`
**Then**
- All SpecFlow commands continue to work
- Local SQLite database is used
- No version control operations available
- Developer can switch back to Dolt when online

### Scenario 5: View Version History

**Given** features have been modified over time
**When** developer runs `specflow dolt log`
**Then**
- Commit history is displayed
- Each commit shows features added/modified
- Developer can run `specflow dolt diff <commit>` to see changes

## Functional Requirements

**FR-1: DatabaseAdapter abstraction**
All database operations go through `DatabaseAdapter` interface. No direct SQLite or Dolt calls outside adapters.

**FR-2: SQLite adapter parity**
`SQLiteAdapter` provides 100% feature parity with current SQLite implementation. All existing operations work.

**FR-3: Dolt adapter implementation**
`DoltAdapter` implements all `DatabaseAdapter` methods using MySQL2 client for SQL operations.

**FR-4: Async conversion**
All database methods are async. Callers use `await` for database operations. Synchronous `bun:sqlite` calls are wrapped in `Promise.resolve()`.

**FR-5: Configuration-based selection**
Backend selection via `.specflow/config.json`. Factory pattern creates appropriate adapter at startup.

**FR-6: Version control commands**
`specflow dolt init|status|commit|push|pull|log|diff` commands work when Dolt backend is configured.

**FR-7: Migration tool**
`specflow migrate sqlite-to-dolt` migrates existing SQLite database to Dolt, including schema and data.

**FR-8: Graceful degradation**
When Dolt backend configured but Dolt unavailable (not installed, server down), clear error message guides user to fallback or resolution.

**FR-9: Schema compatibility**
Dolt schema exactly matches SQLite schema. All columns, types, and constraints are equivalent.

**FR-10: Backward compatibility**
Existing SQLite projects continue working without changes. Dolt is opt-in via configuration.

## Non-Functional Requirements

**NFR-1: Performance**
Dolt operations should be comparable to SQLite for single-user operations (< 2x latency acceptable for collaboration benefits).

**NFR-2: Reliability**
Database adapter failures should not corrupt local state. Dolt push/pull failures should leave local database intact.

**NFR-3: Documentation**
Clear documentation for:
- How to set up Dolt backend
- How to migrate from SQLite
- How to use version control commands
- How to resolve conflicts (if they occur)

**NFR-4: Testing**
All adapter implementations have 100% feature parity tests. Both SQLite and Dolt pass the same test suite.

## Success Criteria

1. **DatabaseAdapter interface defined**: Interface covers all database operations with async signatures
2. **SQLiteAdapter works**: All existing SpecFlow commands work with SQLiteAdapter (test suite passes)
3. **DoltAdapter works**: All SpecFlow commands work with DoltAdapter (test suite passes)
4. **Version control works**: `dolt init/commit/push/pull` commands successfully sync state between two developers
5. **Migration tool works**: `migrate sqlite-to-dolt` successfully moves existing database to Dolt
6. **Configuration works**: Switching backends via config file correctly changes database implementation
7. **Documentation complete**: Setup guide enables new user to configure Dolt backend successfully
8. **Offline fallback works**: SQLite backend continues working when Dolt is unavailable

## Constraints & Assumptions

### Constraints

- Must maintain 100% backward compatibility with existing SQLite projects
- Cannot require Dolt installation for SQLite-only users
- Schema changes must work with both backends (migrations run on both)
- No breaking changes to CLI command signatures

### Assumptions

- **Dolt availability**: Assumes Dolt CLI is installed when using Dolt backend (installation check on init)
- **DoltHub account**: Assumes team has DoltHub account for remote sync (free tier sufficient for most projects)
- **Conflict resolution**: [TO BE REFINED] Assumes conflicts are rare (manual resolution via Dolt CLI if they occur)
- **Connection config**: [TO BE REFINED] For local Dolt development, assumes `dolt sql-server` is running or using embedded mode
- **MySQL2 client**: Uses `mysql2` npm package for Dolt connection (standard MySQL protocol)

### Open Questions

- [TO BE REFINED] **Dolt server vs CLI**: Should adapter use `dolt sql-server` (always-on) or shell out to `dolt sql` commands? Trade-off: server requires daemon, CLI requires process overhead.
- [TO BE REFINED] **Conflict handling**: What happens when two developers modify the same feature simultaneously? Auto-merge rules or manual resolution?
- [TO BE REFINED] **Branch strategy**: Should SpecFlow features map to Dolt branches? Or single main branch only for now?
- [TO BE REFINED] **Commit granularity**: Auto-commit on every phase transition, or manual commits only?

## Implementation Notes

### Async Migration Strategy

All database calls in the codebase need to become async:

**Before:**
```typescript
const feature = db.getFeature('F-001');
```

**After:**
```typescript
const feature = await db.getFeature('F-001');
```

This touches approximately 50+ call sites across:
- `src/commands/*.ts` — all CLI command handlers
- `src/lib/phases/*.ts` — phase execution logic
- `src/lib/database.ts` — internal database module
- `tests/**/*.test.ts` — all database tests

### MySQL Type Mappings

SQLite types → MySQL/Dolt types:
- `TEXT` → `VARCHAR(255)` or `TEXT` (depending on length)
- `INTEGER` → `INT` or `BIGINT`
- `REAL` → `DOUBLE`
- `BLOB` → `BLOB`

Timestamp handling:
- SQLite: ISO 8601 strings (`TEXT`)
- Dolt: `DATETIME` or `TIMESTAMP` columns

Adapter must handle serialization/deserialization consistently.

### Dolt SQL Server Mode

Two options for Dolt connection:

**Option A: Dolt SQL Server (recommended for development)**
```bash
dolt sql-server --host localhost --port 3306 --user root
```
Adapter connects via MySQL2, server stays running.

**Option B: Dolt CLI (simpler for single-user)**
Shell out to `dolt sql -q "SELECT ..."` for each query. Higher latency, but no server process.

Recommendation: Use Option A for multi-user, Option B for solo with occasional sync.

## Scope

### In Scope

- DatabaseAdapter interface abstraction
- SQLiteAdapter implementation (wraps existing logic)
- DoltAdapter implementation (MySQL2 + dolt CLI)
- Async conversion of all database operations
- Configuration file for backend selection
- CLI commands for Dolt version control
- Migration tool (sqlite-to-dolt)
- Documentation for setup and usage
- Test suite covering both adapters

### Out of Scope

- Dolt branch support (single main branch only for now)
- Automated conflict resolution (manual via Dolt CLI)
- Real-time collaboration (no WebSocket/polling, pull-based only)
- Multi-workspace support (one database per project)
- Schema evolution tracking (migrations apply to both backends identically)
- Performance optimization (focus on correctness first)
- GUI for version control (CLI only)

### Future Considerations

- **F-094: Dolt Branching**: Map SpecFlow features to Dolt branches for isolated development
- **F-095: Real-Time Sync**: WebSocket-based live updates when teammates push changes
- **F-096: Conflict UI**: Interactive conflict resolution within SpecFlow CLI
- **F-097: Schema Diffing**: Track schema migrations as Dolt commits for rollback

## Related Work

### Prior Art

- **Dolt Documentation**: https://docs.dolthub.com/
- **MySQL2 Node Client**: https://github.com/sidorares/node-mysql2
- **SpecFlow Database Module**: `packages/specflow/src/lib/database.ts`
- **SpecFlow Migrations**: `packages/specflow/src/lib/migrations/`

### Related Features

- **F-089: Extended Lifecycle** — HARDEN/REVIEW/APPROVE phases depend on database for state storage
- **F-090: Orchestration Visibility** — Pipeline progress file complements database state
- **F-091: TDD Traceability** — Will need shared database for test-to-spec linking across developers
- **F-092: Brownfield Evolve** — Multi-developer feature evolution requires Dolt backend
