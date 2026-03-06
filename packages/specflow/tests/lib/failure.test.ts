import { describe, test, expect } from "bun:test";
import { classifyFailure, getFailureRoute } from "../../src/lib/failure";

describe("classifyFailure", () => {
  test("detects TypeScript errors", () => {
    expect(classifyFailure("error TS2345: Argument of type")).toBe("typecheck");
    expect(classifyFailure("cannot find name 'foo'")).toBe("typecheck");
  });

  test("detects lint errors", () => {
    expect(classifyFailure("eslint found 3 errors")).toBe("lint");
    expect(classifyFailure("prettier --check failed")).toBe("lint");
  });

  test("detects test failures", () => {
    expect(classifyFailure("FAIL src/test.ts")).toBe("test_failure");
    expect(classifyFailure("3 tests failed")).toBe("test_failure");
    expect(classifyFailure("12 pass, 2 fail")).toBe("test_failure");
  });

  test("detects acceptance failures", () => {
    expect(classifyFailure("acceptance test failed")).toBe("acceptance_failure");
    expect(classifyFailure("[x] FAIL: Login flow")).toBe("acceptance_failure");
  });

  test("detects timeouts", () => {
    expect(classifyFailure("operation timed out")).toBe("timeout");
    expect(classifyFailure("SIGTERM received")).toBe("timeout");
  });

  test("detects dependency errors", () => {
    expect(classifyFailure("connect ECONNREFUSED 127.0.0.1:5432")).toBe("dependency");
    expect(classifyFailure("fetch failed: ENOTFOUND api.example.com")).toBe("dependency");
  });

  test("detects validation errors", () => {
    expect(classifyFailure("validation failed for spec")).toBe("validation");
    expect(classifyFailure("missing required field")).toBe("validation");
  });

  test("returns unknown for unrecognized errors", () => {
    expect(classifyFailure("something weird happened")).toBe("unknown");
  });
});

describe("getFailureRoute", () => {
  test("typecheck routes to auto-fix", () => {
    expect(getFailureRoute("typecheck").route).toBe("auto-fix");
  });

  test("lint routes to auto-fix", () => {
    expect(getFailureRoute("lint").route).toBe("auto-fix");
  });

  test("test_failure routes to retry then escalate", () => {
    expect(getFailureRoute("test_failure", 0).route).toBe("retry");
    expect(getFailureRoute("test_failure", 1).route).toBe("retry");
    expect(getFailureRoute("test_failure", 2).route).toBe("escalate");
  });

  test("timeout routes to retry with backoff", () => {
    const r = getFailureRoute("timeout", 0);
    expect(r.route).toBe("retry");
    expect(r.backoff_ms).toBe(1000);

    const r2 = getFailureRoute("timeout", 2);
    expect(r2.route).toBe("retry");
    expect(r2.backoff_ms).toBe(4000);

    expect(getFailureRoute("timeout", 3).route).toBe("escalate");
  });

  test("dependency routes to retry with backoff", () => {
    const r = getFailureRoute("dependency", 0);
    expect(r.route).toBe("retry");
    expect(r.backoff_ms).toBe(2000);
  });

  test("acceptance_failure escalates immediately", () => {
    expect(getFailureRoute("acceptance_failure").route).toBe("escalate");
  });

  test("unknown escalates immediately", () => {
    expect(getFailureRoute("unknown").route).toBe("escalate");
  });
});
