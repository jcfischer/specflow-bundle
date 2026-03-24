/**
 * Dolt Push Command
 * Push commits to remote
 */

import { Command } from "commander";
import { loadConfig } from "../../lib/config";
import { createAdapter } from "../../lib/adapters/factory";

export function createDoltPushCommand(): Command {
  return new Command("push")
    .description("Push commits to remote Dolt repository")
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
          console.log(`Pushing to ${remote}...`);
          await adapter.push?.(remote);
          console.log(`✓ Successfully pushed to ${remote}`);
        } finally {
          await adapter.disconnect();
        }
      } catch (error) {
        console.error(`Error: ${(error as Error).message}`);
        process.exit(1);
      }
    });
}
