import { describe, it, expect } from "bun:test";
import { spawnSync } from "child_process";
import { join } from "path";

const CLI_PATH = join(import.meta.dir, "../src/index.ts");

function runCli(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync("bun", ["run", CLI_PATH, ...args], {
    encoding: "utf-8",
    env: { ...process.env },
  });
  return {
    stdout: result.stdout?.toString() ?? "",
    stderr: result.stderr?.toString() ?? "",
    exitCode: result.status ?? 1,
  };
}

describe("CLI", () => {
  describe("--help", () => {
    it("should display help message", () => {
      const { stdout, exitCode } = runCli(["--help"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("specflow");
      expect(stdout).toContain("Multi-agent orchestration");
    });

    it("should list available commands", () => {
      const { stdout } = runCli(["--help"]);

      expect(stdout).toContain("init");
      expect(stdout).toContain("status");
      expect(stdout).toContain("run");
      expect(stdout).toContain("skip");
      expect(stdout).toContain("reset");
    });
  });

  describe("--version", () => {
    it("should display version number", () => {
      const { stdout, exitCode } = runCli(["--version"]);

      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/\d+\.\d+\.\d+/);
    });
  });

  describe("unknown command", () => {
    it("should show error for unknown command", () => {
      const { stderr, exitCode } = runCli(["unknowncommand"]);

      expect(exitCode).not.toBe(0);
      expect(stderr).toContain("unknown command");
    });
  });

  describe("subcommand help", () => {
    it("should show help for status command", () => {
      const { stdout, exitCode } = runCli(["status", "--help"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("status");
    });
  });
});
