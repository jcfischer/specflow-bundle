/**
 * Migrate SQLite to Dolt Command
 * Migrate existing SQLite database to Dolt
 */

import { Command } from "commander";
import { Database } from "bun:sqlite";
import { exec as execCallback } from "child_process";
import { promisify } from "util";
import { existsSync, copyFileSync } from "fs";
import { loadConfig, saveConfig } from "../lib/config";
import { createAdapter } from "../lib/adapters/factory";
import { getDbPath } from "../lib/database";

const exec = promisify(execCallback);

export function createMigrateToDoltCommand(): Command {
  return new Command("migrate-to-dolt")
    .description("Migrate SQLite database to Dolt backend")
    .requiredOption("--dolt-database <name>", "Dolt database name")
    .option("--dolt-remote <url>", "DoltHub remote URL (e.g., dolthub-org/project)")
    .option("--dolt-host <host>", "Dolt server host", "localhost")
    .option("--dolt-port <port>", "Dolt server port", "3306")
    .option("--dolt-user <user>", "Database user", "root")
    .option("--dolt-password <password>", "Database password", "")
    .option("--no-data", "Migrate schema only, skip data")
    .option("--skip-verification", "Skip row count verification")
    .option("--dry-run", "Preview migration without making changes")
    .action(async (options) => {
      const projectPath = process.cwd();
      const originalConfig = loadConfig(projectPath);
      try {

        // Check if already using Dolt
        if (originalConfig.database.backend === "dolt") {
          console.error("✗ Already using Dolt backend");
          process.exit(1);
        }

        // Check if SQLite database exists
        const sqlitePath = getDbPath(projectPath);
        if (!existsSync(sqlitePath)) {
          console.error(`✗ SQLite database not found: ${sqlitePath}`);
          console.error("  Run 'specflow init' to create a database first");
          process.exit(1);
        }

        console.log("🔄 SQLite to Dolt Migration\n");
        console.log(`Source: ${sqlitePath}`);
        console.log(`Target: ${options.doltDatabase}`);

        if (options.dryRun) {
          console.log("\n[DRY RUN - no changes will be made]\n");
        }

        // Step 1: Backup SQLite database
        console.log("Step 1: Backing up SQLite database...");
        const backupPath = `${sqlitePath}.backup`;
        if (!options.dryRun) {
          copyFileSync(sqlitePath, backupPath);
          console.log(`  ✓ Backup created: ${backupPath}`);
        } else {
          console.log(`  [Would create backup: ${backupPath}]`);
        }

        // Step 2: Count rows in SQLite
        console.log("\nStep 2: Counting rows in SQLite...");
        const sqliteDb = new Database(sqlitePath);
        const tables = sqliteDb
          .query<{ name: string }, []>(
            `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
          )
          .all();

        const rowCounts: Record<string, number> = {};
        for (const table of tables) {
          const count = sqliteDb
            .query<{ count: number }, []>(`SELECT COUNT(*) as count FROM ${table.name}`)
            .get()!.count;
          rowCounts[table.name] = count;
          console.log(`  ${table.name}: ${count} rows`);
        }
        sqliteDb.close();

        // Step 3: Verify Dolt connection BEFORE saving config
        console.log("\nStep 3: Verifying Dolt connection...");
        const doltConfig = {
          database: {
            backend: "dolt" as const,
            dolt: {
              host: options.doltHost,
              port: parseInt(options.doltPort),
              user: options.doltUser,
              password: options.doltPassword,
              database: options.doltDatabase,
              remote: options.doltRemote,
            },
          },
        };

        if (!options.dryRun) {
          // Connect with temp config to verify reachability before touching disk
          const tempAdapter = await createAdapter(projectPath, doltConfig);
          console.log("  ✓ Dolt connection established");
          console.log("  ✓ Schema initialized");
          await tempAdapter.disconnect();
        } else {
          console.log("  [Would verify Dolt connection]");
        }

        // Step 4: Save config (only reached if connection succeeded)
        console.log("\nStep 4: Saving Dolt configuration...");
        if (!options.dryRun) {
          saveConfig(projectPath, doltConfig);
          console.log("  ✓ Configuration updated");
        } else {
          console.log("  [Would update configuration]");
        }

        // Step 5: Copy data
        if (options.data) {
          console.log("\nStep 5: Copying data to Dolt...");
          if (!options.dryRun) {
            await copyDataToDolt(sqlitePath, doltConfig);
            console.log("  ✓ Data copied successfully");
          } else {
            console.log("  [Would copy data from SQLite to Dolt]");
          }

          // Step 6: Verify row counts
          if (!options.skipVerification && !options.dryRun) {
            console.log("\nStep 6: Verifying row counts...");
            await verifyMigration(doltConfig, rowCounts);
            console.log("  ✓ Row counts match");
          } else if (options.dryRun) {
            console.log("\nStep 6: [Would verify row counts]");
          }
        } else {
          console.log("\nStep 5: Skipping data migration (schema only)");
        }

        // Step 7: Create initial commit
        console.log("\nStep 7: Creating initial commit...");
        if (!options.dryRun) {
          const adapter = await createAdapter(projectPath);
          await adapter.commit?.("Initial migration from SQLite");
          console.log("  ✓ Initial commit created");
          await adapter.disconnect();
        } else {
          console.log("  [Would create initial commit]");
        }

        console.log("\n✓ Migration complete!");
        console.log("\nNext steps:");
        console.log("  1. Test your application with Dolt backend");
        console.log("  2. Push to remote: specflow dolt push (if remote configured)");
        console.log(`  3. Backup file preserved at: ${backupPath}`);
      } catch (error) {
        console.error(`\n✗ Migration failed: ${(error as Error).message}`);
        // Auto-restore original config if it was overwritten
        try {
          const currentConfig = loadConfig(projectPath);
          if (currentConfig.database.backend === "dolt") {
            saveConfig(projectPath, originalConfig);
            console.error("  ✓ Configuration restored to SQLite backend");
          }
        } catch {
          console.error(
            "  ✗ Could not auto-restore config — manually restore .specflow/config.json"
          );
        }
        process.exit(1);
      }
    });
}

async function copyDataToDolt(
  sqlitePath: string,
  doltConfig: any
): Promise<void> {
  const sqliteDb = new Database(sqlitePath);

  // Get MySQL connection using adapter
  const adapter = await createAdapter(process.cwd());

  try {
    const tables = sqliteDb
      .query<{ name: string }, []>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'schema_migrations'`
      )
      .all();

    for (const table of tables) {
      // Get column info
      const columns = sqliteDb
        .query<{ name: string }, []>(`PRAGMA table_info(${table.name})`)
        .all()
        .map((c) => c.name);

      // Read all rows from SQLite
      const rows = sqliteDb
        .query<any, []>(`SELECT * FROM ${table.name}`)
        .all();

      if (rows.length === 0) continue;

      console.log(`  Copying ${table.name}: ${rows.length} rows...`);

      // Convert rows to array format
      const rowValues = rows.map((row) => {
        return columns.map((col) => {
          const val = (row as any)[col];
          // Convert timestamp strings to Date objects for MySQL
          if (
            typeof val === "string" &&
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)
          ) {
            return new Date(val);
          }
          return val;
        });
      });

      // Use adapter's bulk insert method (only available on DoltAdapter)
      await adapter.bulkInsert!(table.name, columns, rowValues);
    }
  } finally {
    sqliteDb.close();
    await adapter.disconnect();
  }
}

async function verifyMigration(
  doltConfig: any,
  expectedCounts: Record<string, number>
): Promise<void> {
  const adapter = await createAdapter(process.cwd());

  try {
    for (const [table, expectedCount] of Object.entries(expectedCounts)) {
      const actualCount = await adapter.getTableRowCount!(table);

      if (actualCount !== expectedCount) {
        throw new Error(
          `Row count mismatch for ${table}: expected ${expectedCount}, got ${actualCount}`
        );
      }
    }
  } finally {
    await adapter.disconnect();
  }
}
