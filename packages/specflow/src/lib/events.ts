/**
 * Event Logging
 * Append-only JSONL event log for pipeline audit trail
 */

import { existsSync, appendFileSync, readFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import type { PipelineEvent, PipelineEventType } from "../types";

function getEventsPath(projectPath: string): string {
  return join(projectPath, ".specflow", "events.jsonl");
}

export function emitEvent(projectPath: string, event: PipelineEvent): void {
  const path = getEventsPath(projectPath);
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  appendFileSync(path, JSON.stringify(event) + "\n");
}

export interface ReadEventsOptions {
  since?: Date;
  limit?: number;
  type?: PipelineEventType;
  featureId?: string;
}

export function readEvents(projectPath: string, options: ReadEventsOptions = {}): PipelineEvent[] {
  const path = getEventsPath(projectPath);
  if (!existsSync(path)) return [];

  const content = readFileSync(path, "utf-8");
  const lines = content.trim().split("\n").filter(Boolean);

  let events: PipelineEvent[] = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch {
      // Skip malformed lines
    }
  }

  if (options.since) {
    const sinceMs = options.since.getTime();
    events = events.filter((e) => new Date(e.timestamp).getTime() >= sinceMs);
  }

  if (options.type) {
    events = events.filter((e) => e.type === options.type);
  }

  if (options.featureId) {
    events = events.filter((e) => e.feature_id === options.featureId);
  }

  if (options.limit) {
    events = events.slice(-options.limit);
  }

  return events;
}

export function parseDuration(durationStr: string): number {
  const match = durationStr.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return 0;
  const [, value, unit] = match;
  const multipliers: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return parseInt(value, 10) * (multipliers[unit] || 0);
}
