/**
 * Common utilities for Dolt commands
 * Shared boilerplate for backend validation and adapter lifecycle
 */

import { loadConfig } from "../../lib/config";
import { createAdapter } from "../../lib/adapters/factory";
import type { DatabaseAdapter } from "../../lib/adapters/types";

/**
 * Execute a function with a Dolt adapter
 * Handles backend validation and adapter lifecycle management
 *
 * @param fn Function to execute with the adapter
 * @returns Result of the function
 * @throws Error if backend is not Dolt or if function fails
 */
export async function withDoltAdapter<T>(
  fn: (adapter: DatabaseAdapter) => Promise<T>
): Promise<T> {
  const projectPath = process.cwd();
  const config = loadConfig(projectPath);

  // Check backend
  if (config.database.backend !== "dolt" && config.database.backend !== "dolt-cli") {
    console.error("✗ Version control is only available with Dolt backend");
    console.error(`  Current backend: ${config.database.backend}`);
    process.exit(1);
  }

  const adapter = await createAdapter(projectPath);
  try {
    return await fn(adapter);
  } finally {
    await adapter.disconnect();
  }
}
