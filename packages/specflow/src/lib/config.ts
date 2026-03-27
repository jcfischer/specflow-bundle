/**
 * Configuration Management
 * Load and validate .specflow/config.json
 */

import { join } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import type { DbConfig } from "./adapters/types";
import { SPECFLOW_DIR } from "./database";

// =============================================================================
// Configuration File
// =============================================================================

export const CONFIG_FILENAME = "config.json";

/**
 * Full configuration structure
 */
export interface SpecFlowConfig {
  database: DbConfig;
}

/**
 * Default configuration (SQLite backend)
 */
export function getDefaultConfig(): SpecFlowConfig {
  return {
    database: {
      backend: "sqlite",
      sqlite: {
        path: `.specflow/features.db`,
      },
    },
  };
}

/**
 * Get configuration file path
 */
export function getConfigPath(projectPath: string): string {
  return join(projectPath, SPECFLOW_DIR, CONFIG_FILENAME);
}

/**
 * Load configuration from file
 * @param projectPath - Path to project root
 * @returns Configuration object
 * @throws If config exists but is invalid JSON
 */
export function loadConfig(projectPath: string): SpecFlowConfig {
  const configPath = getConfigPath(projectPath);

  if (!existsSync(configPath)) {
    // No config file, return default
    return getDefaultConfig();
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    const config = JSON.parse(content) as Partial<SpecFlowConfig>;

    // Validate and merge with defaults
    return validateConfig(config);
  } catch (error) {
    throw new Error(
      `Failed to parse config file at ${configPath}: ${(error as Error).message}`
    );
  }
}

/**
 * Validate and normalize configuration
 * @param config - Partial configuration to validate
 * @returns Valid configuration with defaults filled in
 */
export function validateConfig(config: Partial<SpecFlowConfig>): SpecFlowConfig {
  const defaults = getDefaultConfig();

  if (!config.database) {
    return defaults;
  }

  const backend = config.database.backend || defaults.database.backend;

  if (backend !== "sqlite" && backend !== "dolt" && backend !== "dolt-cli") {
    throw new Error(
      `Invalid database backend: ${backend}. Must be "sqlite", "dolt", or "dolt-cli".`
    );
  }

  if (backend === "sqlite") {
    const sqlitePath =
      config.database.sqlite?.path || defaults.database.sqlite!.path;

    return {
      database: {
        backend: "sqlite",
        sqlite: {
          path: sqlitePath,
        },
      },
    };
  }

  if (backend === "dolt") {
    if (!config.database.dolt?.database) {
      throw new Error(
        'Dolt backend requires "database" field in config.database.dolt'
      );
    }

    return {
      database: {
        backend: "dolt",
        dolt: {
          host: config.database.dolt.host || "localhost",
          port: config.database.dolt.port || 3306,
          user: config.database.dolt.user || "root",
          password: config.database.dolt.password || "",
          database: config.database.dolt.database,
          remote: config.database.dolt.remote,
        },
      },
    };
  }

  if (backend === "dolt-cli") {
    return {
      database: {
        backend: "dolt-cli",
        doltCli: {
          path: (config.database as any).doltCli?.path || ".specflow/dolt",
          remote: (config.database as any).doltCli?.remote,
        },
      },
    };
  }

  return defaults;
}

/**
 * Save configuration to file
 * @param projectPath - Path to project root
 * @param config - Configuration to save
 */
export function saveConfig(projectPath: string, config: SpecFlowConfig): void {
  const configPath = getConfigPath(projectPath);
  const specflowDir = join(projectPath, SPECFLOW_DIR);

  // Ensure .specflow directory exists
  if (!existsSync(specflowDir)) {
    mkdirSync(specflowDir, { recursive: true });
  }

  const content = JSON.stringify(config, null, 2);
  writeFileSync(configPath, content + "\n", "utf-8");
}

/**
 * Check if configuration file exists
 */
export function configExists(projectPath: string): boolean {
  return existsSync(getConfigPath(projectPath));
}
