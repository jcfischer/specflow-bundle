import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { getSessionId, initSession, resetSessionCache } from "../../src/lib/session";

describe("session", () => {
  let projectPath: string;

  beforeEach(() => {
    projectPath = mkdtempSync(join(tmpdir(), "specflow-session-test-"));
    resetSessionCache();
  });

  afterEach(() => {
    rmSync(projectPath, { recursive: true, force: true });
    resetSessionCache();
  });

  test("initSession creates session file with UUID", () => {
    const id = initSession(projectPath);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

    const path = join(projectPath, ".specflow", ".session");
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, "utf-8").trim()).toBe(id);
  });

  test("getSessionId returns same ID across calls", () => {
    const id1 = getSessionId(projectPath);
    const id2 = getSessionId(projectPath);
    expect(id1).toBe(id2);
  });

  test("getSessionId creates session if none exists", () => {
    const id = getSessionId(projectPath);
    expect(id).toMatch(/^[0-9a-f]{8}-/);
  });
});
