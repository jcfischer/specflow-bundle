/**
 * Dolt Status Command
 * Show uncommitted changes
 */

import { Command } from "commander";
import { withDoltAdapter } from "./common";

export function createDoltStatusCommand(): Command {
  return new Command("status")
    .description("Show uncommitted changes in Dolt database")
    .action(async () => {
      try {
        await withDoltAdapter(async (adapter) => {
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
        });
      } catch (error) {
        console.error(`Error: ${(error as Error).message}`);
        process.exit(1);
      }
    });
}
