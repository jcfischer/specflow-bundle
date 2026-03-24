/**
 * Dolt Log Command
 * Show commit history
 */

import { Command } from "commander";
import { loadConfig } from "../../lib/config";
import { createAdapter } from "../../lib/adapters/factory";

export function createDoltLogCommand(): Command {
  return new Command("log")
    .description("Show commit history")
    .option("-n, --count <number>", "Number of commits to show", "10")
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
          const limit = parseInt(options.count);
          const commits = await adapter.log?.(limit);

          if (!commits || commits.length === 0) {
            console.log("No commits yet");
            return;
          }

          console.log(`Recent commits (${commits.length}):\n`);
          for (const commit of commits) {
            console.log(commit);
          }
        } finally {
          await adapter.disconnect();
        }
      } catch (error) {
        console.error(`Error: ${(error as Error).message}`);
        process.exit(1);
      }
    });
}
