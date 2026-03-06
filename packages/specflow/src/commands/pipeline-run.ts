/**
 * Pipeline Command
 * Runs the full SpecFlow pipeline for a feature in headless mode:
 * specify -> plan -> tasks -> implement -> complete
 */

import { specifyCommand } from "./specify";
import { planCommand } from "./plan";
import { tasksCommand } from "./tasks";
import { implementCommand } from "./implement";
import { completeCommand } from "./complete";

export interface PipelineCommandOptions {
  /** Stop after this phase (for partial runs) */
  stopAfter?: string;
}

/**
 * Execute the full pipeline for a feature
 */
export async function pipelineRunCommand(
  featureId: string,
  options: PipelineCommandOptions = {}
): Promise<void> {
  // Force headless mode for entire pipeline
  process.env.SPECFLOW_HEADLESS = "true";

  const phases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: "SPECIFY",
      run: () => specifyCommand(featureId, { batch: true }),
    },
    {
      name: "PLAN",
      run: () => planCommand(featureId),
    },
    {
      name: "TASKS",
      run: () => tasksCommand(featureId),
    },
    {
      name: "IMPLEMENT",
      run: () => implementCommand({ featureId }),
    },
    {
      name: "COMPLETE",
      run: () => completeCommand(featureId, { force: false }),
    },
  ];

  console.log(`\n=== SpecFlow Pipeline: ${featureId} ===\n`);

  for (const phase of phases) {
    console.log(`\n--- Phase: ${phase.name} ---\n`);

    try {
      await phase.run();
      console.log(`\n--- ${phase.name}: OK ---\n`);
    } catch (error) {
      console.error(`\n--- ${phase.name}: FAILED ---`);
      console.error(`Error: ${error}`);
      process.exit(1);
    }

    if (options.stopAfter && phase.name.toLowerCase() === options.stopAfter.toLowerCase()) {
      console.log(`\nStopping after ${phase.name} (--stop-after)`);
      break;
    }
  }

  console.log(`\n=== Pipeline complete: ${featureId} ===\n`);
}
