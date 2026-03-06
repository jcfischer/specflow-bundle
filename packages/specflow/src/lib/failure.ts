/**
 * Failure Classification and Routing
 * Categorize errors for appropriate handling
 */

import type { FailureType, FailureRoute } from "../types";

const PATTERNS: Array<{ type: FailureType; patterns: RegExp[] }> = [
  {
    type: "typecheck",
    patterns: [/error TS\d+/, /tsc.*exited/, /type.*error/i, /cannot find name/i],
  },
  {
    type: "lint",
    patterns: [/eslint/, /prettier/, /lint.*error/i],
  },
  {
    type: "acceptance_failure",
    patterns: [/acceptance.*fail/i, /harden.*fail/i, /\[x\]\s*FAIL/i],
  },
  {
    type: "test_failure",
    patterns: [/FAIL\s/, /tests?\s+failed/i, /bun test.*fail/i, /\d+ fail/i, /expect\(.*\)\.to/],
  },
  {
    type: "timeout",
    patterns: [/timeout/i, /timed?\s*out/i, /exceeded.*time/i, /SIGTERM/],
  },
  {
    type: "dependency",
    patterns: [/ECONNREFUSED/, /ENOTFOUND/, /network.*error/i, /fetch failed/i, /ECONNRESET/],
  },
  {
    type: "validation",
    patterns: [/validation.*fail/i, /spec.*invalid/i, /missing required/i, /phase.*gate/i],
  },
];

export function classifyFailure(error: string, _exitCode?: number): FailureType {
  for (const { type, patterns } of PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(error)) return type;
    }
  }
  return "unknown";
}

export interface FailureRouteResult {
  route: FailureRoute;
  backoff_ms?: number;
}

export function getFailureRoute(type: FailureType, retryCount: number = 0): FailureRouteResult {
  switch (type) {
    case "typecheck":
    case "lint":
      return { route: "auto-fix" };

    case "test_failure":
      return retryCount < 2 ? { route: "retry" } : { route: "escalate" };

    case "timeout":
      return retryCount < 3
        ? { route: "retry", backoff_ms: Math.min(1000 * Math.pow(2, retryCount), 30000) }
        : { route: "escalate" };

    case "dependency":
      return retryCount < 3
        ? { route: "retry", backoff_ms: Math.min(2000 * Math.pow(2, retryCount), 60000) }
        : { route: "escalate" };

    case "acceptance_failure":
    case "validation":
    case "unknown":
    default:
      return { route: "escalate" };
  }
}
