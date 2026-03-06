import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { wrapPhaseExecution } from "../../src/lib/pipeline-interceptor";
import { loadPipelineState } from "../../src/lib/pipeline-state";
import { readEvents } from "../../src/lib/events";
import { resetSessionCache } from "../../src/lib/session";

describe("pipeline-interceptor", () => {
  let projectPath: string;

  beforeEach(() => {
    projectPath = mkdtempSync(join(tmpdir(), "specflow-interceptor-test-"));
    resetSessionCache();
  });

  afterEach(() => {
    rmSync(projectPath, { recursive: true, force: true });
    resetSessionCache();
  });

  test("wrapPhaseExecution emits start and complete events on success", async () => {
    const result = await wrapPhaseExecution(
      async () => "success",
      "F-001",
      "test-feature",
      "specify",
      projectPath
    );

    expect(result).toBe("success");

    const events = readEvents(projectPath);
    expect(events.length).toBe(2);
    expect(events[0].type).toBe("phase.started");
    expect(events[0].feature_id).toBe("F-001");
    expect(events[1].type).toBe("phase.completed");
    expect(events[1].data?.duration_ms).toBeDefined();
  });

  test("wrapPhaseExecution records failure on error", async () => {
    try {
      await wrapPhaseExecution(
        async () => { throw new Error("2 tests failed"); },
        "F-001",
        "test-feature",
        "implement",
        projectPath
      );
    } catch {
      // Expected
    }

    const events = readEvents(projectPath);
    const failEvent = events.find((e) => e.type === "phase.failed");
    expect(failEvent).toBeDefined();
    expect(failEvent!.data?.failure_type).toBe("test_failure");
    expect(failEvent!.data?.failure_route).toBe("retry");

    const state = loadPipelineState(projectPath)!;
    expect(state.failures.length).toBe(1);
    expect(state.failures[0].failure_type).toBe("test_failure");
  });

  test("wrapPhaseExecution measures duration", async () => {
    await wrapPhaseExecution(
      async () => { await new Promise((r) => setTimeout(r, 50)); },
      "F-001",
      "test-feature",
      "plan",
      projectPath
    );

    const events = readEvents(projectPath);
    const completeEvent = events.find((e) => e.type === "phase.completed");
    expect(completeEvent!.data!.duration_ms).toBeGreaterThanOrEqual(40);
  });

  test("wrapPhaseExecution updates pipeline state", async () => {
    await wrapPhaseExecution(
      async () => {},
      "F-001",
      "test-feature",
      "specify",
      projectPath
    );

    const state = loadPipelineState(projectPath)!;
    expect(state.features.length).toBe(1);
    expect(state.features[0].id).toBe("F-001");
    expect(state.features[0].phase).toBe("specify");
  });

  test("wrapPhaseExecution re-throws original error", async () => {
    const originalError = new Error("original error");
    try {
      await wrapPhaseExecution(
        async () => { throw originalError; },
        "F-001",
        "test-feature",
        "implement",
        projectPath
      );
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error).toBe(originalError);
    }
  });
});
