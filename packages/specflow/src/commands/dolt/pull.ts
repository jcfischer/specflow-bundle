/**
 * Dolt Pull Command
 * Pull commits from remote
 */

import { Command } from "commander";
import { withDoltAdapter } from "./common";

export function createDoltPullCommand(): Command {
  return new Command("pull")
    .description("Pull commits from remote Dolt repository")
    .argument("[remote]", "Remote name", "origin")
    .action(async (remote: string) => {
      try {
        await withDoltAdapter(async (adapter) => {
          console.log(`Pulling from ${remote}...`);
          await adapter.pull?.(remote);
          console.log(`✓ Successfully pulled from ${remote}`);
        });
      } catch (error) {
        console.error(`Error: ${(error as Error).message}`);
        process.exit(1);
      }
    });
}
