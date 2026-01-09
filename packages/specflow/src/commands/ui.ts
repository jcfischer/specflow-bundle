/**
 * UI Command
 * Starts the SpecFlow web dashboard server.
 */

import { join } from "path";

export interface UICommandOptions {
  port?: string;
}

export async function uiCommand(options: UICommandOptions = {}): Promise<void> {
  const port = options.port ? parseInt(options.port) : 3000;

  // Import and start the server from specflow-ui
  const serverPath = join(process.env.HOME || "", "work/specflow-ui/src/server.ts");

  // Set port via environment variable
  process.env.PORT = String(port);

  console.log(`Starting SpecFlow UI on port ${port}...`);

  // Dynamic import to start the server
  await import(serverPath);
}
