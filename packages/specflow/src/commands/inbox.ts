/**
 * Inbox Command
 * Priority-ranked review queue of features awaiting human attention
 */

import {
  initDatabase,
  closeDatabase,
  getDbPath,
  dbExists,
} from "../lib/database";
import { buildInboxQueue, suggestBatchApprove } from "../lib/inbox";

export interface InboxCommandOptions {
  json?: boolean;
  verbose?: boolean;
}

export async function inboxCommand(
  options: InboxCommandOptions = {}
): Promise<void> {
  const projectPath = process.cwd();

  if (!dbExists(projectPath)) {
    console.error("Error: No SpecFlow database found. Run 'specflow init' first.");
    process.exit(1);
  }

  const dbPath = getDbPath(projectPath);

  try {
    initDatabase(dbPath);

    const queue = buildInboxQueue();

    if (options.json) {
      console.log(JSON.stringify({ queue, summary: getSummary(queue) }, null, 2));
      return;
    }

    if (queue.length === 0) {
      console.log("📥 Inbox empty — no features awaiting review");
      return;
    }

    console.log(`\n📥 SpecFlow Inbox — ${queue.length} item(s) awaiting review\n`);

    for (const item of queue) {
      const icon = item.priority === "P0" ? "🔴" : item.priority === "P1" ? "🟡" : "🟢";
      console.log(
        `${icon} ${item.priority}  ${item.featureId.padEnd(8)} ${item.name.padEnd(25).slice(0, 25)} ${item.verdict.padEnd(16)} ${item.timeInQueue}`
      );
    }

    const batchCmd = suggestBatchApprove(queue);
    if (batchCmd) {
      console.log(`\nQuick action:`);
      console.log(`  ${batchCmd}`);
    }
  } finally {
    closeDatabase();
  }
}

function getSummary(queue: { priority: string }[]) {
  return {
    total: queue.length,
    p0: queue.filter((i) => i.priority === "P0").length,
    p1: queue.filter((i) => i.priority === "P1").length,
    p2: queue.filter((i) => i.priority === "P2").length,
  };
}
