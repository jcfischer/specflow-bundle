import { describe, it, expect } from "bun:test";
import {
  getGateTitle,
  createAutoApprover,
  createRejectAtGateApprover,
  buildInventoryGateContext,
  buildSanitizationGateContext,
  buildPreExtractionGateContext,
  buildPostExtractionGateContext,
  buildVerificationGateContext,
} from "../../../src/lib/contrib-prep/gates";

// =============================================================================
// Gate Titles
// =============================================================================

describe("getGateTitle", () => {
  it("should return correct titles for gates 1-5", () => {
    expect(getGateTitle(1)).toBe("Inventory Review");
    expect(getGateTitle(2)).toBe("Sanitization Review");
    expect(getGateTitle(3)).toBe("Pre-Extraction Approval");
    expect(getGateTitle(4)).toBe("Extraction Review");
    expect(getGateTitle(5)).toBe("Final Verification");
  });

  it("should return fallback for unknown gate numbers", () => {
    expect(getGateTitle(0)).toBe("Gate 0");
    expect(getGateTitle(6)).toBe("Gate 6");
    expect(getGateTitle(99)).toBe("Gate 99");
  });
});

// =============================================================================
// Auto Approver
// =============================================================================

describe("createAutoApprover", () => {
  it("should approve all gates when approve=true", async () => {
    const approver = createAutoApprover(true);

    expect(await approver(1, { title: "t", summary: "s" })).toBe(true);
    expect(await approver(2, { title: "t", summary: "s" })).toBe(true);
    expect(await approver(5, { title: "t", summary: "s" })).toBe(true);
  });

  it("should reject all gates when approve=false", async () => {
    const approver = createAutoApprover(false);

    expect(await approver(1, { title: "t", summary: "s" })).toBe(false);
    expect(await approver(3, { title: "t", summary: "s" })).toBe(false);
    expect(await approver(5, { title: "t", summary: "s" })).toBe(false);
  });
});

// =============================================================================
// Reject-at-Gate Approver
// =============================================================================

describe("createRejectAtGateApprover", () => {
  it("should reject only at the specified gate", async () => {
    const approver = createRejectAtGateApprover(3);

    expect(await approver(1, { title: "t", summary: "s" })).toBe(true);
    expect(await approver(2, { title: "t", summary: "s" })).toBe(true);
    expect(await approver(3, { title: "t", summary: "s" })).toBe(false);
    expect(await approver(4, { title: "t", summary: "s" })).toBe(true);
    expect(await approver(5, { title: "t", summary: "s" })).toBe(true);
  });

  it("should reject at gate 1", async () => {
    const approver = createRejectAtGateApprover(1);
    expect(await approver(1, { title: "t", summary: "s" })).toBe(false);
    expect(await approver(2, { title: "t", summary: "s" })).toBe(true);
  });

  it("should reject at gate 5", async () => {
    const approver = createRejectAtGateApprover(5);
    expect(await approver(4, { title: "t", summary: "s" })).toBe(true);
    expect(await approver(5, { title: "t", summary: "s" })).toBe(false);
  });
});

// =============================================================================
// Gate Context Builders
// =============================================================================

describe("buildInventoryGateContext", () => {
  it("should build inventory gate context", () => {
    const ctx = buildInventoryGateContext(10, 5, 2, "/path/to/registry.json");

    expect(ctx.title).toBe("Inventory Review");
    expect(ctx.summary).toContain("Review the file inventory");
    expect(ctx.details).toContain("Included files: 10");
    expect(ctx.details).toContain("Excluded files: 5");
    expect(ctx.details).toContain("Files needing review: 2");
    expect(ctx.details).toContain("Registry: /path/to/registry.json");
  });
});

describe("buildSanitizationGateContext", () => {
  it("should build pass context when sanitization passes", () => {
    const ctx = buildSanitizationGateContext(true, 0);

    expect(ctx.title).toBe("Sanitization Review");
    expect(ctx.summary).toContain("passed");
    expect(ctx.details).toContain("Pass: true");
    expect(ctx.details).toContain("Findings: 0");
  });

  it("should build fail context with finding count", () => {
    const ctx = buildSanitizationGateContext(false, 3);

    expect(ctx.title).toBe("Sanitization Review");
    expect(ctx.summary).toContain("3 issue(s)");
    expect(ctx.details).toContain("Pass: false");
    expect(ctx.details).toContain("Findings: 3");
  });
});

describe("buildPreExtractionGateContext", () => {
  it("should build pre-extraction context", () => {
    const ctx = buildPreExtractionGateContext("F-1", "contrib/F-1/v1", "main", 15);

    expect(ctx.title).toBe("Pre-Extraction Approval");
    expect(ctx.summary).toContain("annotated tag");
    expect(ctx.details).toContain("Feature: F-1");
    expect(ctx.details).toContain("Tag: contrib/F-1/v1");
    expect(ctx.details).toContain("Base branch: main");
    expect(ctx.details).toContain("Files to extract: 15");
  });
});

describe("buildPostExtractionGateContext", () => {
  it("should build post-extraction context", () => {
    const ctx = buildPostExtractionGateContext("contrib/F-1/v1", "contrib/F-1", 12);

    expect(ctx.title).toBe("Extraction Review");
    expect(ctx.summary).toContain("Extraction complete");
    expect(ctx.details).toContain("Tag: contrib/F-1/v1");
    expect(ctx.details).toContain("Branch: contrib/F-1");
    expect(ctx.details).toContain("Files extracted: 12");
  });
});

describe("buildVerificationGateContext", () => {
  it("should build pass context", () => {
    const ctx = buildVerificationGateContext(true, ["PASS: inventory-match", "PASS: sanitization"]);

    expect(ctx.title).toBe("Final Verification");
    expect(ctx.summary).toContain("passed");
    expect(ctx.summary).toContain("Ready to push");
    expect(ctx.details).toContain("PASS: inventory-match");
    expect(ctx.details).toContain("PASS: sanitization");
  });

  it("should build fail context", () => {
    const ctx = buildVerificationGateContext(false, ["FAIL: sanitization"]);

    expect(ctx.title).toBe("Final Verification");
    expect(ctx.summary).toContain("failed");
    expect(ctx.details).toContain("FAIL: sanitization");
  });
});
