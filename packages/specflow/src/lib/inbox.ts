/**
 * Inbox Library
 * Priority-ranked review queue for human supervisors
 */

import type { Feature, InboxItem, ApprovalGate } from "../types";
import { getFeatures, getApprovalGate, getLatestReviewRecord } from "./database";

/**
 * Build the inbox queue from features awaiting review
 */
export function buildInboxQueue(): InboxItem[] {
  const features = getFeatures();
  const items: InboxItem[] = [];

  for (const f of features) {
    // Features at review phase with pending approval
    if (f.phase === "review") {
      const gate = getApprovalGate(f.id);
      if (!gate || gate.status !== "pending") continue;

      const review = getLatestReviewRecord(f.id);
      const passed = review?.passed ?? false;
      const timeMs = Date.now() - gate.triggeredAt.getTime();

      let priority: InboxItem["priority"];
      let verdict: string;

      if (!passed) {
        priority = "P0";
        verdict = "NEEDS ATTENTION";
      } else if (timeMs < 24 * 60 * 60 * 1000) {
        priority = "P1";
        verdict = "ALL PASS";
      } else {
        priority = "P2";
        verdict = "ALL PASS";
      }

      items.push({
        featureId: f.id,
        name: f.name,
        priority,
        verdict,
        timeInQueue: formatDuration(timeMs),
        timeInQueueMs: timeMs,
        action: passed
          ? `specflow approve ${f.id}`
          : `specflow review ${f.id}`,
      });
    }

    // Blocked features
    if (f.status === "blocked") {
      items.push({
        featureId: f.id,
        name: f.name,
        priority: "P0",
        verdict: "BLOCKED",
        timeInQueue: "—",
        timeInQueueMs: 0,
        action: `specflow status ${f.id}`,
      });
    }
  }

  // Sort: P0 first, then P1, then P2. Within same priority, oldest first.
  items.sort((a, b) => {
    const pOrder = { P0: 0, P1: 1, P2: 2 };
    if (pOrder[a.priority] !== pOrder[b.priority]) {
      return pOrder[a.priority] - pOrder[b.priority];
    }
    return b.timeInQueueMs - a.timeInQueueMs; // oldest first
  });

  return items;
}

/**
 * Suggest a batch approve command for passing items
 */
export function suggestBatchApprove(queue: InboxItem[]): string | null {
  const approvable = queue.filter(
    (item) => item.verdict === "ALL PASS" && (item.priority === "P1" || item.priority === "P2")
  );
  if (approvable.length < 2) return null;
  return `specflow approve ${approvable.map((i) => i.featureId).join(" ")}`;
}

/**
 * Format a duration in milliseconds to human-readable string
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
