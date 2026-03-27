/**
 * Shared SQL utility functions
 * Eliminates duplication and provides well-tested SQL operations
 */

/**
 * Escape and format a value for SQL query interpolation
 * Used by adapters that don't support prepared statements (e.g., Dolt CLI)
 *
 * SECURITY: This function must handle all edge cases to prevent SQL injection.
 * Prefer prepared statements when available; use this only when unavoidable.
 *
 * @param value - The value to escape
 * @returns SQL-safe string representation of the value
 */
export function escapeSqlValue(value: any): string {
  if (value === null || value === undefined) {
    return "NULL";
  }

  if (typeof value === "number") {
    // Numbers are safe as-is (no injection risk)
    if (!isFinite(value)) {
      throw new Error(`Cannot escape non-finite number: ${value}`);
    }
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }

  if (value instanceof Date) {
    // ISO format for datetime columns
    return `'${value.toISOString()}'`;
  }

  // String: escape single quotes per SQL standard
  // SQL injection prevention: '' is the standard SQL escape for single quotes
  const escaped = String(value).replace(/'/g, "''");
  return `'${escaped}'`;
}

/**
 * Interpolate parameterized query values into SQL string
 * Replaces '?' placeholders with escaped values
 *
 * SECURITY NOTE: Only use this when prepared statements are not available.
 * Dolt CLI doesn't support prepared statements, so this is necessary.
 *
 * @param query - SQL query with '?' placeholders
 * @param values - Array of values to interpolate
 * @returns SQL query with values interpolated
 */
export function interpolateQuery(query: string, values?: any[]): string {
  if (!values || values.length === 0) {
    return query;
  }

  let idx = 0;
  return query.replace(/\?/g, () => {
    if (idx >= values.length) {
      throw new Error(
        `Query has more placeholders than values (${values.length} values provided)`
      );
    }
    const val = values[idx++];
    return escapeSqlValue(val);
  });
}

/**
 * Parse JSON result from Dolt CLI output
 * Handles both {rows: [...]} format and [...] format
 *
 * @param output - Raw stdout from `dolt sql -r json`
 * @returns Array of result rows
 */
export function parseJsonResult(output: string): any[] {
  const trimmed = output.trim();
  if (!trimmed || trimmed === "[]") {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed);
    // dolt sql -r json returns { rows: [...] } for SELECT queries
    if (parsed && parsed.rows) {
      return parsed.rows;
    }
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Check if Dolt CLI is installed (Bun.spawn version for CLI mode)
 * @throws Error if Dolt is not found
 */
export async function checkDoltCliBun(): Promise<void> {
  try {
    const proc = Bun.spawn(["dolt", "version"], { stdout: "pipe", stderr: "pipe" });
    await proc.exited;
    if (proc.exitCode !== 0) {
      throw new Error("dolt not found");
    }
  } catch {
    throw new Error("Dolt CLI not found. Install from: https://docs.dolthub.com/introduction/installation");
  }
}

/**
 * Check if Dolt CLI is installed (exec version for server mode)
 * Requires 'util' promisify wrapper
 * @throws Error if Dolt is not found
 */
export async function checkDoltCliExec(exec: (cmd: string) => Promise<{ stdout: string; stderr: string }>): Promise<void> {
  try {
    await exec("which dolt");
  } catch {
    throw new Error("Dolt CLI not found. Install from: https://docs.dolthub.com/introduction/installation");
  }
}
