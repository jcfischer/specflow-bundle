/**
 * Database Adapter Wrapper
 * Provides backward-compatible synchronous-style API using adapters
 * This allows existing code to work with both SQLite and Dolt backends
 */

import { createAdapter } from "./adapters/factory";
import type { DatabaseAdapter } from "./adapters/types";

let adapterInstance: DatabaseAdapter | null = null;
let adapterProjectPath: string | null = null;

/**
 * Get or create adapter instance
 * This caches the adapter for the current project
 */
export async function getAdapter(projectPath: string): Promise<DatabaseAdapter> {
  if (adapterInstance && adapterProjectPath === projectPath) {
    return adapterInstance;
  }

  if (adapterInstance) {
    await adapterInstance.disconnect();
  }

  adapterInstance = await createAdapter(projectPath);
  adapterProjectPath = projectPath;
  return adapterInstance;
}

/**
 * Close the adapter instance
 */
export async function closeAdapter(): Promise<void> {
  if (adapterInstance) {
    await adapterInstance.disconnect();
    adapterInstance = null;
    adapterProjectPath = null;
  }
}

/**
 * Get current adapter instance (throws if not initialized)
 */
export function getCurrentAdapter(): DatabaseAdapter {
  if (!adapterInstance) {
    throw new Error("Database adapter not initialized. Call getAdapter() first.");
  }
  return adapterInstance;
}
