/**
 * Pipeline State Management
 * Atomic file operations for .specflow/pipeline.json
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from "fs";
import { join, basename } from "path";
import type { PipelineState, PipelineFeature, PipelineFailure } from "../types";

function getPipelinePath(projectPath: string): string {
  return join(projectPath, ".specflow", "pipeline.json");
}

function ensureSpecflowDir(projectPath: string): void {
  const dir = join(projectPath, ".specflow");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function getProjectName(projectPath: string): string {
  try {
    const pkg = JSON.parse(readFileSync(join(projectPath, "package.json"), "utf-8"));
    return pkg.name || basename(projectPath);
  } catch {
    return basename(projectPath);
  }
}

export function createEmptyState(projectPath: string, sessionId: string): PipelineState {
  return {
    version: 1,
    updated_at: new Date().toISOString(),
    project: getProjectName(projectPath),
    session_id: sessionId,
    features: [],
    failures: [],
  };
}

export function loadPipelineState(projectPath: string): PipelineState | null {
  const path = getPipelinePath(projectPath);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

export function savePipelineState(projectPath: string, state: PipelineState): void {
  ensureSpecflowDir(projectPath);
  const path = getPipelinePath(projectPath);
  const tmpPath = `${path}.tmp.${Date.now()}`;
  state.updated_at = new Date().toISOString();
  writeFileSync(tmpPath, JSON.stringify(state, null, 2));
  renameSync(tmpPath, path);
}

export function updateFeatureInPipeline(
  projectPath: string,
  sessionId: string,
  featureId: string,
  updates: Partial<PipelineFeature>
): PipelineState {
  let state = loadPipelineState(projectPath) || createEmptyState(projectPath, sessionId);
  state.session_id = sessionId;

  const idx = state.features.findIndex((f) => f.id === featureId);
  if (idx >= 0) {
    state.features[idx] = { ...state.features[idx], ...updates, last_transition: new Date().toISOString() };
  } else {
    state.features.push({
      id: featureId,
      name: updates.name || featureId,
      phase: updates.phase || "none",
      status: updates.status || "in_progress",
      started_at: new Date().toISOString(),
      last_transition: new Date().toISOString(),
      session_id: sessionId,
      blocked_reason: null,
      metrics: updates.metrics || {},
      ...updates,
    } as PipelineFeature);
  }

  savePipelineState(projectPath, state);
  return state;
}

export function addFailureToPipeline(
  projectPath: string,
  sessionId: string,
  failure: PipelineFailure
): PipelineState {
  let state = loadPipelineState(projectPath) || createEmptyState(projectPath, sessionId);
  state.session_id = sessionId;
  state.failures.push(failure);
  savePipelineState(projectPath, state);
  return state;
}

export function clearFailure(projectPath: string, sessionId: string, featureId: string): boolean {
  const state = loadPipelineState(projectPath);
  if (!state) return false;

  const failure = state.failures.find((f) => f.feature_id === featureId && !f.recovered);
  if (!failure) return false;

  failure.recovered = true;
  state.session_id = sessionId;
  savePipelineState(projectPath, state);
  return true;
}

export function removeFeatureFromPipeline(projectPath: string, sessionId: string, featureId: string): void {
  const state = loadPipelineState(projectPath);
  if (!state) return;

  state.features = state.features.filter((f) => f.id !== featureId);
  state.session_id = sessionId;
  savePipelineState(projectPath, state);
}
