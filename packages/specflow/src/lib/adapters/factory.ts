/**
 * Adapter Factory
 * Create appropriate database adapter based on configuration
 */

import type { DatabaseAdapter } from "./types";
import { loadConfig } from "../config";

/**
 * Create database adapter based on configuration
 * @param projectPath - Path to SpecFlow project root
 * @param configOverride - Optional config to use instead of loading from disk (e.g. for pre-save connection testing)
 * @returns Initialized DatabaseAdapter
 */
export async function createAdapter(
  projectPath: string,
  configOverride?: ReturnType<typeof loadConfig>
): Promise<DatabaseAdapter> {
  const config = configOverride ?? loadConfig(projectPath);

  switch (config.database.backend) {
    case "dolt": {
      const { DoltAdapter } = await import("./dolt");
      const adapter = new DoltAdapter();
      await adapter.connect(config.database);
      return adapter;
    }

    case "dolt-cli": {
      const { DoltCliAdapter } = await import("./dolt-cli");
      const adapter = new DoltCliAdapter();
      await adapter.connect(config.database);
      return adapter;
    }

    case "sqlite":
    default: {
      const { SQLiteAdapter } = await import("./sqlite");
      const adapter = new SQLiteAdapter();
      await adapter.connect(config.database);
      return adapter;
    }
  }
}
