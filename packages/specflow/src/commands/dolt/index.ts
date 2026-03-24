/**
 * Dolt Command Group
 * Version control commands for Dolt backend
 */

import { Command } from "commander";
import { createDoltInitCommand } from "./init";
import { createDoltStatusCommand } from "./status";
import { createDoltCommitCommand } from "./commit";
import { createDoltPushCommand } from "./push";
import { createDoltPullCommand } from "./pull";
import { createDoltLogCommand } from "./log";
import { createDoltDiffCommand } from "./diff";

export function createDoltCommand(): Command {
  const dolt = new Command("dolt")
    .description("Version control operations for Dolt backend");

  dolt.addCommand(createDoltInitCommand());
  dolt.addCommand(createDoltStatusCommand());
  dolt.addCommand(createDoltCommitCommand());
  dolt.addCommand(createDoltPushCommand());
  dolt.addCommand(createDoltPullCommand());
  dolt.addCommand(createDoltLogCommand());
  dolt.addCommand(createDoltDiffCommand());

  return dolt;
}
