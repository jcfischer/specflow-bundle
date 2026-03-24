/**
 * Dolt Status Command
 * Show uncommitted changes
 */

import { Command } from "commander";
import { loadConfig } from "../../lib/config";
import { createAdapter } from "../../lib/adapters/factory";

export function createDoltStatusCommand(): Command {
  return new Command("status")
    .description("Show uncommitted changes in Dolt database")
    .action(async () => {
      try {
        const projectPath = process.cwd();
        const config = loadConfig(projectPath);

        // Check backend
        if (config.database.backend !== "dolt") {
          console.error("✗ Version control is only available with Dolt backend");
          console.error("  Current backend: SQLite");
          console.error("  Run 'specflow dolt init' to configure Dolt");
          process.exit(1);
        }

        const adapter = await createAdapter(projectPath);
        try {
          const status = await adapter.status?.();

          if (!status) {
            console.error("✗ Status not available for this backend");
            process.exit(1);
          }

          console.log(`Branch: ${status.branch || "main"}`);
          console.log(`Remote: ${status.remote || "(not configured)"}`);

          if (status.ahead || status.behind) {
            console.log(
              `  Ahead: ${status.ahead || 0} | Behind: ${status.behind || 0}`
            );
          }

          if (status.clean) {
            console.log("\n✓ Working tree clean");
          } else {
            console.log("\nUncommitted changes:");
            if (status.uncommittedChanges && status.uncommittedChanges.length > 0) {
              for (const table of status.uncommittedChanges) {
                console.log(`  • ${table}`);
              }
            } else {
              console.log("  (modified tables)");
            }
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
