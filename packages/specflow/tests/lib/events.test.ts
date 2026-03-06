import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { emitEvent, readEvents, parseDuration } from "../../src/lib/events";
import type { PipelineEvent } from "../../src/types";

describe("events", () => {
  let projectPath: string;

  beforeEach(() => {
    projectPath = mkdtempSync(join(tmpdir(), "specflow-events-test-"));
  });

  afterEach(() => {
    rmSync(projectPath, { recursive: true, force: true });
  });

  function makeEvent(overrides: Partial<PipelineEvent> = {}): PipelineEvent {
    return {
      type: "phase.started",
      timestamp: new Date().toISOString(),
      session_id: "test-session",
      feature_id: "F-001",
      phase: "specify",
      ...overrides,
    };
  }

  test("emitEvent creates events.jsonl and appends", () => {
    emitEvent(projectPath, makeEvent());
    emitEvent(projectPath, makeEvent({ type: "phase.completed" }));

    const path = join(projectPath, ".specflow", "events.jsonl");
    expect(existsSync(path)).toBe(true);

    const lines = readFileSync(path, "utf-8").trim().split("\n");
    expect(lines.length).toBe(2);

    const first = JSON.parse(lines[0]);
    expect(first.type).toBe("phase.started");
  });

  test("readEvents returns empty array when no file", () => {
    expect(readEvents(projectPath)).toEqual([]);
  });

  test("readEvents filters by type", () => {
    emitEvent(projectPath, makeEvent({ type: "phase.started" }));
    emitEvent(projectPath, makeEvent({ type: "phase.completed" }));
    emitEvent(projectPath, makeEvent({ type: "phase.failed" }));

    const events = readEvents(projectPath, { type: "phase.completed" });
    expect(events.length).toBe(1);
    expect(events[0].type).toBe("phase.completed");
  });

  test("readEvents filters by featureId", () => {
    emitEvent(projectPath, makeEvent({ feature_id: "F-001" }));
    emitEvent(projectPath, makeEvent({ feature_id: "F-002" }));

    const events = readEvents(projectPath, { featureId: "F-001" });
    expect(events.length).toBe(1);
    expect(events[0].feature_id).toBe("F-001");
  });

  test("readEvents respects limit", () => {
    for (let i = 0; i < 10; i++) {
      emitEvent(projectPath, makeEvent());
    }

    const events = readEvents(projectPath, { limit: 3 });
    expect(events.length).toBe(3);
  });

  test("readEvents filters by since", () => {
    const oldEvent = makeEvent({ timestamp: new Date(Date.now() - 3600000).toISOString() });
    const newEvent = makeEvent({ timestamp: new Date().toISOString() });

    emitEvent(projectPath, oldEvent);
    emitEvent(projectPath, newEvent);

    const events = readEvents(projectPath, { since: new Date(Date.now() - 1800000) });
    expect(events.length).toBe(1);
  });
});

describe("parseDuration", () => {
  test("parses seconds", () => expect(parseDuration("30s")).toBe(30000));
  test("parses minutes", () => expect(parseDuration("5m")).toBe(300000));
  test("parses hours", () => expect(parseDuration("1h")).toBe(3600000));
  test("parses days", () => expect(parseDuration("2d")).toBe(172800000));
  test("returns 0 for invalid", () => expect(parseDuration("invalid")).toBe(0));
});
