/**
 * Dolt Push Command
 * Push commits to remote
 */

import { Command } from "commander";
import { withDoltAdapter } from "./common";

export function createDoltPushCommand(): Command {
  return new Command("push")
    .description("Push commits to remote Dolt repository")
    .argument("[remote]", "Remote name", "origin")
    .action(async (remote: string) => {
      try {
        await withDoltAdapter(async (adapter) => {
          console.log(`Pushing to ${remote}...`);
          await adapter.push?.(remote);
          console.log(`✓ Successfully pushed to ${remote}`);
        });
      } catch (error) {
        console.error(`Error: ${(error as Error).message}`);
        process.exit(1);
      }
    });
}
