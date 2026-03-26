import { describe, it, expect, mock, beforeEach } from "bun:test";

// Mock config and factory before importing common
const mockLoadConfig = mock(() => ({
  database: { backend: "dolt" as const },
}));

const mockDisconnect = mock(async () => {});
const mockAdapter = { disconnect: mockDisconnect };
const mockCreateAdapter = mock(async (_path: string) => mockAdapter as any);

mock.module("../../../src/lib/config", () => ({
  loadConfig: mockLoadConfig,
}));

mock.module("../../../src/lib/adapters/factory", () => ({
  createAdapter: mockCreateAdapter,
}));

// Import after mocking
const { withDoltAdapter } = await import("../../../src/commands/dolt/common");

describe("withDoltAdapter", () => {
  beforeEach(() => {
    mockLoadConfig.mockClear();
    mockDisconnect.mockClear();
    mockCreateAdapter.mockClear();
  });

  it("calls fn with adapter and returns result", async () => {
    const result = await withDoltAdapter(async (adapter) => {
      expect(adapter).toBe(mockAdapter as any);
      return "ok";
    });
    expect(result).toBe("ok");
  });

  it("calls adapter.disconnect after fn completes", async () => {
    await withDoltAdapter(async () => "done");
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it("calls adapter.disconnect even when fn throws", async () => {
    await expect(
      withDoltAdapter(async () => {
        throw new Error("fn failed");
      })
    ).rejects.toThrow("fn failed");
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it("exits when backend is not dolt", async () => {
    mockLoadConfig.mockImplementationOnce(() => ({
      database: { backend: "sqlite" as any },
    }));

    const mockExit = mock((_code: number) => { throw new Error("process.exit called"); });
    const originalExit = process.exit;
    process.exit = mockExit as any;

    try {
      await expect(withDoltAdapter(async () => "unreachable")).rejects.toThrow("process.exit called");
      expect(mockExit).toHaveBeenCalledWith(1);
    } finally {
      process.exit = originalExit;
    }
  });
});
