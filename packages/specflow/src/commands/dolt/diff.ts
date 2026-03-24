/**
 * Dolt Diff Command
 * Show diff between commits
 */

import { Command } from "commander";
import { withDoltAdapter } from "./common";

export function createDoltDiffCommand(): Command {
  return new Command("diff")
    .description("Show diff between commits or working tree")
    .argument("[commit]", "Commit hash to diff against (defaults to HEAD)")
    .action(async (commit?: string) => {
      try {
        await withDoltAdapter(async (adapter) => {
          const diff = await adapter.diff?.(commit);

          if (!diff || diff.trim().length === 0) {
            console.log("No differences");
            return;
          }

          console.log(diff);
        });
      } catch (error) {
        console.error(`Error: ${(error as Error).message}`);
        process.exit(1);
      }
    });
}
