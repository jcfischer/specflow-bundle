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
    .requiredOption("--remote <url>", "DoltHub remote URL (e.g., dolthub-org/project)")
    .option("--database <name>", "Dolt database name", "specflow_features")
    .option("--host <host>", "Dolt server host", "localhost")
    .option("--port <port>", "Dolt server port", "3306")
    .option("--user <user>", "Database user", "root")
    .option("--password <password>", "Database password", "")
    .action(async (options) => {
      try {
        const projectPath = process.cwd();
        const config = loadConfig(projectPath);

        // Check if already using Dolt
        if (config.database.backend === "dolt") {
          console.log("✓ Already using Dolt backend");
          console.log(`  Database: ${config.database.dolt?.database}`);
          console.log(`  Remote: ${config.database.dolt?.remote || "(not configured)"}`);
          return;
        }

        // Update configuration to use Dolt
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

        console.log("✓ Configuration updated to use Dolt backend");
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
      } catch (error) {
        console.error(`Error: ${(error as Error).message}`);
        process.exit(1);
      }
    });
}
