/**
 * Dolt Pull Command
 * Pull commits from remote
 */

import { Command } from "commander";
import { loadConfig } from "../../lib/config";
import { createAdapter } from "../../lib/adapters/factory";

export function createDoltPullCommand(): Command {
  return new Command("pull")
    .description("Pull commits from remote Dolt repository")
    .argument("[remote]", "Remote name", "origin")
    .action(async (remote: string) => {
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
          console.log(`Pulling from ${remote}...`);
          await adapter.pull?.(remote);
          console.log(`✓ Successfully pulled from ${remote}`);
        } finally {
          await adapter.disconnect();
        }
      } catch (error) {
        console.error(`Error: ${(error as Error).message}`);
        process.exit(1);
      }
    });
}
