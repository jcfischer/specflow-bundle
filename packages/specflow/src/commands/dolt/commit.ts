/**
 * Dolt Commit Command
 * Commit changes to Dolt
 */

import { Command } from "commander";
import { loadConfig } from "../../lib/config";
import { createAdapter } from "../../lib/adapters/factory";

export function createDoltCommitCommand(): Command {
  return new Command("commit")
    .description("Commit changes to Dolt database")
    .requiredOption("-m, --message <message>", "Commit message")
    .action(async (options) => {
      try {
        const projectPath = process.cwd();
        const config = loadConfig(projectPath);

        // Check backend
        if (config.database.backend !== "dolt") {
          console.error("✗ Version control is only available with Dolt backend");
          console.error("  Current backend: SQLite");
          process.exit(1);
        }

        const adapter = await createAdapter(projectPath);
        try {
          await adapter.commit?.(options.message);
          console.log("✓ Changes committed");
          console.log(`  Message: ${options.message}`);
        } finally {
          await adapter.disconnect();
        }
      } catch (error) {
        console.error(`Error: ${(error as Error).message}`);
        process.exit(1);
      }
    });
}
