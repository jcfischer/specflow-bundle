import { Database } from "bun:sqlite";
import type { Project } from "./scanner";

export interface Feature {
  id: string;
  name: string;
  description: string;
  priority: number;
  status: "pending" | "in_progress" | "complete" | "skipped";
  phase: "none" | "specify" | "plan" | "tasks" | "implement";
  specPath: string | null;
  createdAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface ProjectStats {
  total: number;
  complete: number;
  inProgress: number;
  pending: number;
  skipped: number;
  percentComplete: number;
}

export interface ProjectWithData extends Project {
  features: Feature[];
  stats: ProjectStats;
}

interface FeatureRow {
  id: string;
  name: string;
  description: string;
  priority: number;
  status: string;
  phase: string;
  spec_path: string | null;
  created_at: string | null;
  started_at: string | null;
  completed_at: string | null;
}

/**
 * Parse ISO date string to Date object
 */
function parseDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Read all features from a SpecFlow database
 */
export function readFeatures(dbPath: string): Feature[] {
  try {
    const db = new Database(dbPath, { readonly: true });

    const rows = db.query<FeatureRow, []>(
      `SELECT id, name, description, priority, status, phase,
              spec_path, created_at, started_at, completed_at
       FROM features
       ORDER BY priority ASC, name ASC`
    ).all();

    db.close();

    return rows.map((row): Feature => ({
      id: row.id,
      name: row.name,
      description: row.description,
      priority: row.priority,
      status: row.status as Feature["status"],
      phase: row.phase as Feature["phase"],
      specPath: row.spec_path,
      createdAt: parseDate(row.created_at),
      startedAt: parseDate(row.started_at),
      completedAt: parseDate(row.completed_at),
    }));
  } catch {
    // Database doesn't exist, is corrupted, or schema mismatch
    return [];
  }
}

/**
 * Calculate project statistics from features
 */
export function calculateStats(features: Feature[]): ProjectStats {
  const total = features.length;
  const complete = features.filter((f) => f.status === "complete").length;
  const inProgress = features.filter((f) => f.status === "in_progress").length;
  const pending = features.filter((f) => f.status === "pending").length;
  const skipped = features.filter((f) => f.status === "skipped").length;
  const percentComplete = total > 0 ? Math.round((complete / total) * 100) : 0;

  return {
    total,
    complete,
    inProgress,
    pending,
    skipped,
    percentComplete,
  };
}

/**
 * Load project with features and calculated stats
 */
export function loadProjectData(project: Project): ProjectWithData {
  const features = readFeatures(project.dbPath);
  const stats = calculateStats(features);

  return {
    ...project,
    features,
    stats,
  };
}
