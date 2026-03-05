/**
 * Audit Command
 * Detect spec-reality drift and output a health report
 */

import {
  initDatabase,
  closeDatabase,
  getFeature,
  getFeatures,
  getDbPath,
  dbExists,
} from "../lib/database";
import { runFeatureAudit } from "../lib/audit";
import type { AuditCheckResult } from "../types";

export interface AuditCommandOptions {
  json?: boolean;
}

export async function auditCommand(
  featureId: string | undefined,
  options: AuditCommandOptions = {}
): Promise<void> {
  const projectPath = process.cwd();

  if (!dbExists(projectPath)) {
    console.error("Error: No SpecFlow database found. Run 'specflow init' first.");
    process.exit(1);
  }

  const dbPath = getDbPath(projectPath);

  try {
    initDatabase(dbPath);

    let features;
    if (featureId) {
      const f = getFeature(featureId);
      if (!f) {
        console.error(`Error: Feature ${featureId} not found.`);
        process.exit(1);
      }
      features = [f];
    } else {
      features = getFeatures().filter((f) => f.status !== "skipped");
    }

    const allResults: Array<{ featureId: string; name: string; checks: AuditCheckResult[] }> = [];
    let totalIssues = 0;

    for (const f of features) {
      const checks = runFeatureAudit(f, projectPath);
      const issues = checks.filter((c) => !c.passed).length;
      totalIssues += issues;
      allResults.push({ featureId: f.id, name: f.name, checks });
    }

    if (options.json) {
      console.log(JSON.stringify({ features: allResults, totalIssues }, null, 2));
      return;
    }

    for (const result of allResults) {
      const issues = result.checks.filter((c) => !c.passed);
      if (features.length > 1 && issues.length === 0) continue; // Skip clean features in batch mode

      console.log(`\n🔍 Audit: ${result.featureId} — ${result.name}\n`);
      for (const check of result.checks) {
        const icon = check.passed ? "✓" : "✗";
        console.log(`  ${icon} ${check.name}: ${check.message}`);
        if (check.details) {
          for (const d of check.details) {
            console.log(`    - ${d}`);
          }
        }
      }
    }

    console.log(`\n${totalIssues} issue(s) found across ${features.length} feature(s)`);
  } finally {
    closeDatabase();
  }
}
