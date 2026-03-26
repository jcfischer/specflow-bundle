/**
 * Dolt Log Command
 * Show commit history
 */

import { Command } from "commander";
import { withDoltAdapter } from "./common";

export function createDoltLogCommand(): Command {
  return new Command("log")
    .description("Show commit history")
    .option("-n, --count <number>", "Number of commits to show", "10")
    .action(async (options) => {
      try {
        await withDoltAdapter(async (adapter) => {
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
        });
      } catch (error) {
        console.error(`Error: ${(error as Error).message}`);
        process.exit(1);
      }
    });
}
