/**
 * Notification System
 * Pluggable notification dispatch with hook execution
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { spawnSync } from "child_process";
import type { PipelineEvent, NotificationConfig } from "../types";
import { emitEvent } from "./events";

const DEFAULT_CONFIG: NotificationConfig = {
  file: { enabled: true, path: ".specflow/events.jsonl" },
  webhook: { enabled: false, url: null },
  hooks: [],
};

function getConfigPath(projectPath: string): string {
  return join(projectPath, ".specflow", "config.json");
}

export function loadNotificationConfig(projectPath: string): NotificationConfig {
  const path = getConfigPath(projectPath);
  if (!existsSync(path)) return DEFAULT_CONFIG;
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    return {
      file: { ...DEFAULT_CONFIG.file, ...raw.notifications?.file },
      webhook: { ...DEFAULT_CONFIG.webhook, ...raw.notifications?.webhook },
      hooks: raw.notifications?.hooks || [],
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function runHook(hookPath: string, event: PipelineEvent, timeout: number = 5000): void {
  if (!existsSync(hookPath)) return;

  try {
    spawnSync(hookPath, [], {
      input: JSON.stringify(event),
      timeout,
      stdio: ["pipe", "pipe", "pipe"],
      encoding: "utf-8",
    });
  } catch {
    // Hook failures are logged but don't block
  }
}

export function dispatchNotification(projectPath: string, event: PipelineEvent): void {
  const config = loadNotificationConfig(projectPath);

  // Always log to events.jsonl
  if (config.file.enabled) {
    emitEvent(projectPath, event);
  }

  // POST to webhook if configured
  if (config.webhook.enabled && config.webhook.url) {
    try {
      fetch(config.webhook.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      }).catch(() => {}); // Fire and forget
    } catch {
      // Webhook failures don't block
    }
  }

  // Run hooks sequentially with timeout
  for (const hook of config.hooks) {
    runHook(hook, event);
  }
}
