/**
 * Session Management
 * Track session identity for inter-session visibility
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { randomUUID } from "crypto";

let cachedSessionId: string | null = null;

function getSessionPath(projectPath: string): string {
  return join(projectPath, ".specflow", ".session");
}

export function getSessionId(projectPath: string): string {
  if (cachedSessionId) return cachedSessionId;

  const path = getSessionPath(projectPath);
  if (existsSync(path)) {
    cachedSessionId = readFileSync(path, "utf-8").trim();
    return cachedSessionId;
  }

  return initSession(projectPath);
}

export function initSession(projectPath: string): string {
  const id = randomUUID();
  const path = getSessionPath(projectPath);
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, id);
  cachedSessionId = id;
  return id;
}

export function resetSessionCache(): void {
  cachedSessionId = null;
}
