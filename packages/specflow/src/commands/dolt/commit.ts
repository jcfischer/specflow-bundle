/**
 * Dolt Commit Command
 * Commit changes to Dolt
 */

import { Command } from "commander";
import { withDoltAdapter } from "./common";

export function createDoltCommitCommand(): Command {
  return new Command("commit")
    .description("Commit changes to Dolt database")
    .requiredOption("-m, --message <message>", "Commit message")
    .action(async (options) => {
      try {
        await withDoltAdapter(async (adapter) => {
          await adapter.commit?.(options.message);
          console.log("✓ Changes committed");
          console.log(`  Message: ${options.message}`);
        });
      } catch (error) {
        console.error(`Error: ${(error as Error).message}`);
        process.exit(1);
      }
    });
}
