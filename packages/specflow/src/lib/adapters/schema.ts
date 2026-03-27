/**
 * Shared schema definitions with dialect-specific rendering
 * Eliminates duplication across SQLite, Dolt, and Dolt CLI adapters
 */

export type SqlDialect = "sqlite" | "mysql";

export interface ColumnDefinition {
  name: string;
  type: { sqlite: string; mysql: string };
  notNull?: boolean;
  primaryKey?: boolean;
  autoIncrement?: boolean;
  defaultValue?: string;
}

export interface TableDefinition {
  name: string;
  columns: ColumnDefinition[];
  indexes?: { name: string; columns: string[] }[];
  foreignKeys?: { column: string; references: string }[];
}

// =============================================================================
// Schema Definitions
// =============================================================================

export const SCHEMA_DEFINITIONS: TableDefinition[] = [
  {
    name: "features",
    columns: [
      { name: "id", type: { sqlite: "TEXT", mysql: "VARCHAR(255)" }, primaryKey: true },
      { name: "name", type: { sqlite: "TEXT", mysql: "VARCHAR(255)" }, notNull: true },
      { name: "description", type: { sqlite: "TEXT", mysql: "TEXT" }, notNull: true },
      { name: "priority", type: { sqlite: "INTEGER", mysql: "INT" }, notNull: true, defaultValue: "999" },
      { name: "status", type: { sqlite: "TEXT", mysql: "VARCHAR(50)" }, notNull: true, defaultValue: "'pending'" },
      { name: "phase", type: { sqlite: "TEXT", mysql: "VARCHAR(50)" }, notNull: true, defaultValue: "'none'" },
      { name: "spec_path", type: { sqlite: "TEXT", mysql: "VARCHAR(500)" } },
      { name: "created_at", type: { sqlite: "TEXT", mysql: "DATETIME" }, notNull: true },
      { name: "started_at", type: { sqlite: "TEXT", mysql: "DATETIME" } },
      { name: "completed_at", type: { sqlite: "TEXT", mysql: "DATETIME" } },
      { name: "migrated_from", type: { sqlite: "TEXT", mysql: "VARCHAR(255)" } },
      { name: "quick_start", type: { sqlite: "INTEGER", mysql: "TINYINT" }, defaultValue: "0" },
      { name: "problem_type", type: { sqlite: "TEXT", mysql: "VARCHAR(100)" } },
      { name: "urgency", type: { sqlite: "TEXT", mysql: "VARCHAR(100)" } },
      { name: "primary_user", type: { sqlite: "TEXT", mysql: "VARCHAR(100)" } },
      { name: "integration_scope", type: { sqlite: "TEXT", mysql: "VARCHAR(100)" } },
      { name: "usage_context", type: { sqlite: "TEXT", mysql: "VARCHAR(100)" } },
      { name: "data_requirements", type: { sqlite: "TEXT", mysql: "VARCHAR(100)" } },
      { name: "performance_requirements", type: { sqlite: "TEXT", mysql: "VARCHAR(100)" } },
      { name: "priority_tradeoff", type: { sqlite: "TEXT", mysql: "VARCHAR(100)" } },
      { name: "uncertainties", type: { sqlite: "TEXT", mysql: "TEXT" } },
      { name: "clarification_needed", type: { sqlite: "TEXT", mysql: "TEXT" } },
      { name: "skip_reason", type: { sqlite: "TEXT", mysql: "VARCHAR(100)" } },
      { name: "skip_justification", type: { sqlite: "TEXT", mysql: "TEXT" } },
      { name: "skip_validated_at", type: { sqlite: "TEXT", mysql: "DATETIME" } },
      { name: "skip_duplicate_of", type: { sqlite: "TEXT", mysql: "VARCHAR(255)" } },
    ],
    indexes: [
      { name: "idx_features_status", columns: ["status"] },
      { name: "idx_features_priority", columns: ["priority"] },
    ],
  },
  {
    name: "harden_results",
    columns: [
      { name: "id", type: { sqlite: "INTEGER", mysql: "INT" }, primaryKey: true, autoIncrement: true },
      { name: "feature_id", type: { sqlite: "TEXT", mysql: "VARCHAR(255)" }, notNull: true },
      { name: "test_name", type: { sqlite: "TEXT", mysql: "VARCHAR(500)" }, notNull: true },
      { name: "status", type: { sqlite: "TEXT", mysql: "VARCHAR(50)" }, notNull: true },
      { name: "evidence", type: { sqlite: "TEXT", mysql: "TEXT" } },
      { name: "ingested_at", type: { sqlite: "TEXT", mysql: "DATETIME" }, notNull: true, defaultValue: "CURRENT_TIMESTAMP" },
    ],
    foreignKeys: [{ column: "feature_id", references: "features(id)" }],
  },
  {
    name: "review_records",
    columns: [
      { name: "id", type: { sqlite: "INTEGER", mysql: "INT" }, primaryKey: true, autoIncrement: true },
      { name: "feature_id", type: { sqlite: "TEXT", mysql: "VARCHAR(255)" }, notNull: true },
      { name: "reviewed_at", type: { sqlite: "TEXT", mysql: "DATETIME" }, notNull: true, defaultValue: "CURRENT_TIMESTAMP" },
      { name: "passed", type: { sqlite: "INTEGER", mysql: "TINYINT" }, notNull: true },
      { name: "checks_json", type: { sqlite: "TEXT", mysql: "TEXT" } },
      { name: "acceptance_json", type: { sqlite: "TEXT", mysql: "TEXT" } },
    ],
    foreignKeys: [{ column: "feature_id", references: "features(id)" }],
  },
  {
    name: "approval_gates",
    columns: [
      { name: "id", type: { sqlite: "INTEGER", mysql: "INT" }, primaryKey: true, autoIncrement: true },
      { name: "feature_id", type: { sqlite: "TEXT", mysql: "VARCHAR(255)" }, notNull: true },
      { name: "status", type: { sqlite: "TEXT", mysql: "VARCHAR(50)" }, notNull: true },
      { name: "triggered_at", type: { sqlite: "TEXT", mysql: "DATETIME" }, notNull: true, defaultValue: "CURRENT_TIMESTAMP" },
      { name: "resolved_at", type: { sqlite: "TEXT", mysql: "DATETIME" } },
      { name: "rejection_reason", type: { sqlite: "TEXT", mysql: "TEXT" } },
    ],
    foreignKeys: [{ column: "feature_id", references: "features(id)" }],
  },
];

// =============================================================================
// DDL Rendering
// =============================================================================

/**
 * Render a single column definition for the target dialect
 */
function renderColumn(col: ColumnDefinition, dialect: SqlDialect): string {
  const parts: string[] = [col.name, col.type[dialect]];

  if (col.primaryKey) parts.push("PRIMARY KEY");
  if (col.autoIncrement) {
    if (dialect === "sqlite") parts.push("AUTOINCREMENT");
    else parts.push("AUTO_INCREMENT");
  }
  if (col.notNull) parts.push("NOT NULL");
  if (col.defaultValue) parts.push(`DEFAULT ${col.defaultValue}`);

  return parts.join(" ");
}

/**
 * Render CREATE TABLE statement for the target dialect
 */
export function renderCreateTable(table: TableDefinition, dialect: SqlDialect): string {
  const columnDefs = table.columns.map((col) => renderColumn(col, dialect));

  // Add foreign keys
  if (table.foreignKeys) {
    for (const fk of table.foreignKeys) {
      columnDefs.push(`FOREIGN KEY (${fk.column}) REFERENCES ${fk.references}`);
    }
  }

  // For MySQL with inline indexes
  if (dialect === "mysql" && table.indexes) {
    for (const idx of table.indexes) {
      columnDefs.push(`INDEX ${idx.name} (${idx.columns.join(", ")})`);
    }
  }

  return `CREATE TABLE IF NOT EXISTS ${table.name} (
  ${columnDefs.join(",\n  ")}
)`;
}

/**
 * Render CREATE INDEX statements (for SQLite, which doesn't support inline INDEX)
 */
export function renderIndexes(table: TableDefinition): string[] {
  if (!table.indexes) return [];

  return table.indexes.map(
    (idx) =>
      `CREATE INDEX IF NOT EXISTS ${idx.name} ON ${table.name}(${idx.columns.join(", ")})`
  );
}

/**
 * Render all CREATE TABLE and CREATE INDEX statements for the schema
 */
export function renderSchema(dialect: SqlDialect): string[] {
  const statements: string[] = [];

  for (const table of SCHEMA_DEFINITIONS) {
    statements.push(renderCreateTable(table, dialect));

    // For SQLite, add separate CREATE INDEX statements
    if (dialect === "sqlite") {
      statements.push(...renderIndexes(table));
    }
  }

  return statements;
}
