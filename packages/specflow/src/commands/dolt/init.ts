/**
 * Dolt Init Command
 * Initialize Dolt database and remote
 */

import { Command } from "commander";
import { loadConfig, saveConfig } from "../../lib/config";
import { createAdapter } from "../../lib/adapters/factory";

export function createDoltInitCommand(): Command {
  return new Command("init")
    .description("Initialize Dolt database and configure remote")
    .option("--remote <url>", "DoltHub remote URL (e.g., dolthub-org/project)")
    .option("--cli", "Use serverless CLI mode (no running server required, data stored in repo)")
    .option("--path <path>", "Path to Dolt data directory (CLI mode only)", ".specflow/dolt")
    .option("--database <name>", "Dolt database name (server mode)", "specflow_features")
    .option("--host <host>", "Dolt server host (server mode)", "localhost")
    .option("--port <port>", "Dolt server port (server mode)", "3306")
    .option("--user <user>", "Database user (server mode)", "root")
    .option("--password <password>", "Database password (server mode)", "")
    .action(async (options) => {
      try {
        const projectPath = process.cwd();
        const config = loadConfig(projectPath);

        // Check if already using Dolt
        if (config.database.backend === "dolt" || config.database.backend === "dolt-cli") {
          console.log(`✓ Already using ${config.database.backend} backend`);
          if (config.database.backend === "dolt-cli") {
            console.log(`  Path: ${config.database.doltCli?.path}`);
          } else {
            console.log(`  Database: ${config.database.dolt?.database}`);
          }
          return;
        }

        if (options.cli) {
          // CLI mode: serverless, data directory in repo
          const newConfig = {
            database: {
              backend: "dolt-cli" as const,
              doltCli: {
                path: options.path,
                remote: options.remote,
              },
            },
          };

          saveConfig(projectPath, newConfig);

          console.log("✓ Configuration updated to use Dolt CLI backend (serverless)");
          console.log(`  Data directory: ${options.path}`);
          if (options.remote) {
            console.log(`  Remote: ${options.remote}`);
          }

          // Initialize — connect triggers dolt init if directory doesn't exist
          const adapter = await createAdapter(projectPath);
          await adapter.disconnect();

          console.log("✓ Dolt data directory initialized");
          console.log("\nThe data directory can be committed to git for collaboration.");
          console.log("\nNext steps:");
          console.log("  1. Run specflow init to create features");
          console.log("  2. Commit data: specflow dolt commit -m 'Initial features'");
          if (options.remote) {
            console.log("  3. Push to remote: specflow dolt push");
          }
        } else {
          // Server mode: requires running dolt sql-server
          if (!options.remote) {
            console.error("Error: --remote is required for server mode. Use --cli for serverless mode.");
            process.exit(1);
          }

          const newConfig = {
            database: {
              backend: "dolt" as const,
              dolt: {
                host: options.host,
                port: parseInt(options.port),
                user: options.user,
                password: options.password,
                database: options.database,
                remote: options.remote,
              },
            },
          };

          saveConfig(projectPath, newConfig);

          console.log("✓ Configuration updated to use Dolt server backend");
          console.log(`  Database: ${options.database}`);
          console.log(`  Remote: ${options.remote}`);

          // Initialize Dolt repository
          const adapter = await createAdapter(projectPath);
          try {
            await adapter.init?.();
            console.log("✓ Dolt repository initialized");
            console.log(`  Remote 'origin' configured: ${options.remote}`);
          } catch (error) {
            console.error(`✗ Failed to initialize Dolt: ${(error as Error).message}`);
            process.exit(1);
          } finally {
            await adapter.disconnect();
          }

          console.log("\nNext steps:");
          console.log("  1. Create initial commit: specflow dolt commit -m 'Initial commit'");
          console.log("  2. Push to remote: specflow dolt push");
        }
      } catch (error) {
        console.error(`Error: ${(error as Error).message}`);
        process.exit(1);
      }
    });
}
