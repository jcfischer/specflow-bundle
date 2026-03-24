/**
 * Dolt Diff Command
 * Show diff between commits
 */

import { Command } from "commander";
import { loadConfig } from "../../lib/config";
import { createAdapter } from "../../lib/adapters/factory";

export function createDoltDiffCommand(): Command {
  return new Command("diff")
    .description("Show diff between commits or working tree")
    .argument("[commit]", "Commit hash to diff against (defaults to HEAD)")
    .action(async (commit?: string) => {
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
          const diff = await adapter.diff?.(commit);

          if (!diff || diff.trim().length === 0) {
            console.log("No differences");
            return;
          }

          console.log(diff);
        } finally {
          await adapter.disconnect();
        }
      } catch (error) {
        console.error(`Error: ${(error as Error).message}`);
        process.exit(1);
      }
    });
}
