import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  loadPipelineState,
  savePipelineState,
  createEmptyState,
  updateFeatureInPipeline,
  addFailureToPipeline,
  clearFailure,
  removeFeatureFromPipeline,
} from "../../src/lib/pipeline-state";
import type { PipelineState, PipelineFailure } from "../../src/types";

describe("pipeline-state", () => {
  let projectPath: string;

  beforeEach(() => {
    projectPath = mkdtempSync(join(tmpdir(), "specflow-test-"));
  });

  afterEach(() => {
    rmSync(projectPath, { recursive: true, force: true });
  });

  test("loadPipelineState returns null when no file exists", () => {
    expect(loadPipelineState(projectPath)).toBeNull();
  });

  test("savePipelineState creates .specflow directory and writes file", () => {
    const state = createEmptyState(projectPath, "test-session");
    savePipelineState(projectPath, state);

    const path = join(projectPath, ".specflow", "pipeline.json");
    expect(existsSync(path)).toBe(true);

    const loaded = loadPipelineState(projectPath);
    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(1);
    expect(loaded!.session_id).toBe("test-session");
  });

  test("savePipelineState uses atomic write (no .tmp files left)", () => {
    const state = createEmptyState(projectPath, "test-session");
    savePipelineState(projectPath, state);

    const dir = join(projectPath, ".specflow");
    const files = require("fs").readdirSync(dir);
    const tmpFiles = files.filter((f: string) => f.includes(".tmp."));
    expect(tmpFiles.length).toBe(0);
  });

  test("updateFeatureInPipeline adds new feature", () => {
    const state = updateFeatureInPipeline(projectPath, "sess-1", "F-001", {
      name: "test-feature",
      phase: "specify",
      status: "in_progress",
    });

    expect(state.features.length).toBe(1);
    expect(state.features[0].id).toBe("F-001");
    expect(state.features[0].name).toBe("test-feature");
    expect(state.features[0].phase).toBe("specify");
  });

  test("updateFeatureInPipeline updates existing feature", () => {
    updateFeatureInPipeline(projectPath, "sess-1", "F-001", {
      name: "test-feature",
      phase: "specify",
    });

    const state = updateFeatureInPipeline(projectPath, "sess-1", "F-001", {
      phase: "plan",
    });

    expect(state.features.length).toBe(1);
    expect(state.features[0].phase).toBe("plan");
  });

  test("addFailureToPipeline records failure", () => {
    const failure: PipelineFailure = {
      feature_id: "F-001",
      phase: "implement",
      failure_type: "test_failure",
      failure_route: "retry",
      message: "2 tests failed",
      occurred_at: new Date().toISOString(),
      recovered: false,
      retry_count: 0,
    };

    const state = addFailureToPipeline(projectPath, "sess-1", failure);
    expect(state.failures.length).toBe(1);
    expect(state.failures[0].failure_type).toBe("test_failure");
  });

  test("clearFailure marks failure as recovered", () => {
    const failure: PipelineFailure = {
      feature_id: "F-001",
      phase: "implement",
      failure_type: "test_failure",
      failure_route: "retry",
      message: "2 tests failed",
      occurred_at: new Date().toISOString(),
      recovered: false,
      retry_count: 0,
    };

    addFailureToPipeline(projectPath, "sess-1", failure);
    const result = clearFailure(projectPath, "sess-1", "F-001");
    expect(result).toBe(true);

    const state = loadPipelineState(projectPath)!;
    expect(state.failures[0].recovered).toBe(true);
  });

  test("clearFailure returns false when no failure found", () => {
    expect(clearFailure(projectPath, "sess-1", "F-999")).toBe(false);
  });

  test("removeFeatureFromPipeline removes feature", () => {
    updateFeatureInPipeline(projectPath, "sess-1", "F-001", { name: "test" });
    updateFeatureInPipeline(projectPath, "sess-1", "F-002", { name: "test2" });

    removeFeatureFromPipeline(projectPath, "sess-1", "F-001");
    const state = loadPipelineState(projectPath)!;
    expect(state.features.length).toBe(1);
    expect(state.features[0].id).toBe("F-002");
  });
});
