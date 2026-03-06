# Technical Plan: F-090 Orchestration Visibility

## Architecture Overview

F-090 adds a visibility and notification layer on top of SpecFlow's existing phase management. It produces structured state files that external systems can consume, without modifying the core phase execution logic.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SpecFlow CLI                                       │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │ specify │ │  plan   │ │  tasks  │ │implement│ │ harden  │ │complete │   │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘   │
│       │           │           │           │           │           │         │
│       └───────────┴───────────┴─────┬─────┴───────────┴───────────┘         │
│                                     │                                        │
│                          ┌──────────▼──────────┐                            │
│                          │   Phase Transition   │                            │
│                          │      Interceptor     │                            │
│                          └──────────┬──────────┘                            │
│                                     │                                        │
│              ┌──────────────────────┼──────────────────────┐                │
│              │                      │                      │                │
│     ┌────────▼────────┐   ┌────────▼────────┐   ┌────────▼────────┐        │
│     │  Pipeline File  │   │   Event Logger  │   │ Notification    │        │
│     │  (pipeline.json)│   │  (events.jsonl) │   │ Dispatcher      │        │
│     └────────┬────────┘   └────────┬────────┘   └────────┬────────┘        │
│              │                      │                      │                │
└──────────────┼──────────────────────┼──────────────────────┼────────────────┘
               │                      │                      │
               ▼                      ▼                      ▼
        .specflow/             .specflow/              External Hooks
        pipeline.json          events.jsonl            (webhooks, voice, etc.)
```

**Key Design Principles:**

1. **Non-invasive integration** — Existing commands continue working unchanged; visibility is layered on top via a shared interceptor
2. **File-based state** — `pipeline.json` is the source of truth for inter-session visibility; no daemon required
3. **Append-only events** — `events.jsonl` provides audit trail; never truncated during normal operation
4. **Pluggable notifications** — Core defines the interface; backends are external shell scripts or webhooks

## Technology Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Runtime | Bun | Project standard |
| State file | JSON | Human-readable, atomic via rename |
| Event log | JSONL | Append-friendly, line-oriented for tailing |
| Session ID | UUID v4 | `crypto.randomUUID()` — native in Bun |
| File I/O | Node fs (sync) | Atomic writes via temp+rename pattern |
| Hook execution | `Bun.spawn` | Fire-and-forget with timeout |
| CLI | Commander.js | Project pattern |
| Watch mode | `fs.watch` + polling fallback | Cross-platform file watching |

**No new dependencies required** — all functionality uses Bun/Node stdlib.

## Data Model

### Pipeline State (`pipeline.json`)

```typescript
// src/types/pipeline.ts

export interface PipelineState {
  /** Schema version for forward compatibility */
  version: 1;
  /** ISO timestamp of last update */
  updated_at: string;
  /** Project name (from package.json or directory) */
  project: string;
  /** Current session ID (UUID) */
  session_id: string;
  /** Features currently in the pipeline */
  features: PipelineFeature[];
  /** Active failures awaiting resolution */
  failures: PipelineFailure[];
}

export interface PipelineFeature {
  /** Feature ID (e.g., "F-090") */
  id: string;
  /** Feature name */
  name: string;
  /** Current phase */
  phase: SpecPhase;
  /** Current status within the phase */
  status: "pending" | "in_progress" | "complete" | "blocked";
  /** When this feature entered the pipeline */
  started_at: string;
  /** Last phase transition timestamp */
  last_transition: string;
  /** Session that last touched this feature */
  session_id: string;
  /** If blocked, why */
  blocked_reason: string | null;
  /** Progress metrics */
  metrics: PipelineMetrics;
}

export interface PipelineMetrics {
  /** Specs completed in current phase */
  specs_complete: number;
  /** Total specs in current phase */
  specs_total: number;
  /** Passing tests (if applicable) */
  tests_passing: number;
  /** Total tests (if applicable) */
  tests_total: number;
}

export interface PipelineFailure {
  /** Feature that failed */
  feature_id: string;
  /** Phase where failure occurred */
  phase: SpecPhase;
  /** Failure category (see taxonomy below) */
  failure_type: FailureType;
  /** Human-readable message */
  message: string;
  /** When failure occurred */
  occurred_at: string;
  /** Whether this failure has been acknowledged/cleared */
  recovered: boolean;
  /** Routing hint for external handlers */
  route: FailureRoute;
}

export type FailureType =
  | "typecheck"
  | "lint"
  | "test_failure"
  | "acceptance_failure"
  | "timeout"
  | "dependency"
  | "validation"
  | "unknown";

export type FailureRoute = "auto-fix" | "retry" | "escalate";
```

### Event Types (`events.jsonl`)

```typescript
// src/types/events.ts

export type PipelineEventType =
  | "phase.started"
  | "phase.completed"
  | "phase.failed"
  | "gate.pending"
  | "gate.resolved"
  | "pipeline.blocked"
  | "pipeline.clear"
  | "session.started"
  | "session.ended";

export interface PipelineEvent {
  /** Event type */
  type: PipelineEventType;
  /** ISO timestamp */
  timestamp: string;
  /** Session that emitted this event */
  session_id: string;
  /** Feature ID (if applicable) */
  feature_id?: string;
  /** Event-specific payload */
  payload: Record<string, unknown>;
}

// Payload examples:
// phase.started:   { phase: "implement" }
// phase.completed: { phase: "implement", duration_ms: 45000, metrics: {...} }
// phase.failed:    { phase: "implement", failure_type: "test_failure", message: "..." }
// gate.pending:    { gate_type: "review" }
// gate.resolved:   { gate_type: "review", decision: "approved", by: "human" }
```

### Notification Configuration

```typescript
// src/types/notifications.ts

export interface NotificationConfig {
  /** File logging (always enabled) */
  file: {
    enabled: true;
    path: string; // default: ".specflow/events.jsonl"
  };
  /** Webhook notifications */
  webhook?: {
    enabled: boolean;
    url: string;
    headers?: Record<string, string>;
  };
  /** Shell hook scripts */
  hooks?: string[]; // paths to executables
}
```

### Failure Taxonomy Mapping

| Failure Type | Detection Pattern | Default Route |
|--------------|-------------------|---------------|
| `typecheck` | Exit code from `tsc`, "error TS" in output | `auto-fix` |
| `lint` | Exit code from eslint/prettier | `auto-fix` |
| `test_failure` | `bun test` failures, "FAIL" in output | `retry` (first), `escalate` (repeat) |
| `acceptance_failure` | Harden phase failures | `escalate` |
| `timeout` | Process timeout exceeded | `retry` |
| `dependency` | Network errors, service unavailable | `retry` |
| `validation` | Spec/plan validation failures | `escalate` |
| `unknown` | Unclassified errors | `escalate` |

## API Contracts

### Internal APIs (lib functions)

```typescript
// src/lib/pipeline.ts

/** Initialize or load pipeline state */
export function loadPipelineState(): PipelineState;

/** Atomic update of pipeline state */
export function savePipelineState(state: PipelineState): void;

/** Record a phase transition */
export function recordPhaseTransition(
  featureId: string,
  fromPhase: SpecPhase,
  toPhase: SpecPhase,
  metrics?: PipelineMetrics
): void;

/** Record a failure */
export function recordFailure(
  featureId: string,
  phase: SpecPhase,
  failureType: FailureType,
  message: string
): void;

/** Clear/acknowledge a failure */
export function clearFailure(featureId: string): void;

/** Get current session ID (creates if needed) */
export function getSessionId(): string;
```

```typescript
// src/lib/events.ts

/** Emit an event (appends to events.jsonl + fires notifications) */
export function emitEvent(event: Omit<PipelineEvent, "timestamp" | "session_id">): void;

/** Read recent events */
export function readEvents(options?: { since?: Date; limit?: number }): PipelineEvent[];
```

```typescript
// src/lib/notifications.ts

/** Load notification config from .specflow/config.json or defaults */
export function loadNotificationConfig(): NotificationConfig;

/** Dispatch event to all configured backends */
export function dispatchNotification(event: PipelineEvent): Promise<void>;

/** Run a hook script with event payload */
export function runHook(hookPath: string, event: PipelineEvent, timeout?: number): Promise<void>;
```

### CLI Commands

| Command | Description | Exit Codes |
|---------|-------------|------------|
| `specflow pipeline` | Show current pipeline state | 0 |
| `specflow pipeline --json` | JSON output | 0 |
| `specflow pipeline --watch` | Live-updating view | 0 (Ctrl+C) |
| `specflow pipeline events` | Show recent events | 0 |
| `specflow pipeline events --since 1h` | Filter by time | 0 |
| `specflow pipeline events --type phase.failed` | Filter by type | 0 |
| `specflow pipeline clear <feature-id>` | Acknowledge failure | 0/1 |
| `specflow pipeline retry <feature-id>` | Reset to retry phase | 0/1 |

## Implementation Phases

### Phase 1: Core Data Layer (Day 1)

**Goal:** Pipeline state file and event logging without command integration.

**Files:**
- `src/types/pipeline.ts` — Type definitions
- `src/lib/pipeline.ts` — State management
- `src/lib/events.ts` — Event logging
- `tests/lib/pipeline.test.ts` — Unit tests
- `tests/lib/events.test.ts` — Unit tests

**Tasks:**
1. Define TypeScript types for pipeline state, events, failures
2. Implement `loadPipelineState()` with atomic read
3. Implement `savePipelineState()` with temp+rename pattern
4. Implement `emitEvent()` with JSONL append
5. Implement `readEvents()` with filtering
6. Implement `getSessionId()` with file persistence
7. Write unit tests for all functions

**Verification:**
- Tests pass: state round-trips correctly
- Atomic write verified: power-off simulation doesn't corrupt

### Phase 2: Failure Classification (Day 1-2)

**Goal:** Error categorization with routing hints.

**Files:**
- `src/lib/failure.ts` — Classification logic
- `tests/lib/failure.test.ts` — Unit tests

**Tasks:**
1. Implement `classifyFailure(error: string, exitCode: number): FailureType`
2. Implement `getFailureRoute(type: FailureType, retryCount: number): FailureRoute`
3. Add pattern matchers for TypeScript, ESLint, test runner output
4. Write tests with real error output samples

**Verification:**
- Classification accuracy > 90% on sample error outputs
- Routing logic handles retry escalation

### Phase 3: Phase Transition Interceptor (Day 2)

**Goal:** Intercept existing phase transitions to update pipeline state.

**Files:**
- `src/lib/pipeline-interceptor.ts` — Interception logic
- Modifications to existing commands (non-breaking)

**Tasks:**
1. Create `wrapPhaseExecution(fn, featureId, phase)` higher-order function
2. Modify `specifyCommand`, `planCommand`, `tasksCommand`, `implementCommand`, `completeCommand` to use wrapper
3. Emit `phase.started` on entry
4. Emit `phase.completed` or `phase.failed` on exit
5. Update `pipeline.json` on each transition

**Integration Points:**
```typescript
// In each command (e.g., specify.ts)
export async function specifyCommand(featureId: string, options: SpecifyOptions): Promise<void> {
  return wrapPhaseExecution(
    async () => {
      // existing implementation
    },
    featureId,
    "specify"
  );
}
```

**Verification:**
- Run `specflow specify F-001` — verify `pipeline.json` updates
- Force failure — verify failure recorded with correct type

### Phase 4: Notification System (Day 2-3)

**Goal:** Pluggable notification dispatch.

**Files:**
- `src/lib/notifications.ts` — Dispatch logic
- `.specflow/config.json` — Configuration schema

**Tasks:**
1. Implement `loadNotificationConfig()` with defaults
2. Implement `dispatchNotification()` with parallel dispatch
3. Implement `runHook()` with timeout (5s default)
4. Add webhook POST support with retry
5. Log hook failures without blocking phase transitions

**Configuration Schema:**
```json
{
  "notifications": {
    "file": { "enabled": true },
    "webhook": { "enabled": false, "url": null },
    "hooks": []
  },
  "session": {
    "id_file": ".specflow/.session"
  },
  "events": {
    "retention_days": 30
  }
}
```

**Verification:**
- Create test hook that writes to temp file — verify invocation
- Configure webhook to httpbin.org — verify POST

### Phase 5: CLI Commands (Day 3)

**Goal:** `specflow pipeline` command group.

**Files:**
- `src/commands/pipeline-status.ts` — Replaces current pipeline.ts
- `src/index.ts` — Command registration

**Tasks:**
1. Rename existing `pipeline.ts` to `pipeline-run.ts` (orchestrator)
2. Create new `pipeline-status.ts` with subcommands
3. Implement table view for pipeline state
4. Implement `--json` output
5. Implement `--watch` with file watching
6. Implement `events` subcommand with filters
7. Implement `clear` and `retry` subcommands

**CLI Design:**
```
specflow pipeline                    # Default: show state
specflow pipeline --watch            # Live view
specflow pipeline --json             # JSON output
specflow pipeline events             # Recent events
specflow pipeline events --since 2h  # Time filter
specflow pipeline events --type X    # Type filter
specflow pipeline clear F-001        # Acknowledge failure
specflow pipeline retry F-001        # Reset for retry
specflow pipeline run F-001          # (Renamed from current pipeline)
```

**Verification:**
- Visual inspection of output formatting
- Watch mode updates on file change
- JSON output parseable

### Phase 6: Integration Testing (Day 3-4)

**Goal:** End-to-end verification.

**Files:**
- `tests/integration/pipeline-visibility.test.ts`

**Tasks:**
1. Test full pipeline run with visibility tracking
2. Test failure scenarios (typecheck, test, timeout)
3. Test inter-session visibility (read state from previous session)
4. Test notification dispatch
5. Test retry/clear workflows

**Verification:**
- All integration tests pass
- Manual walkthrough of full workflow

## File Structure

```
packages/specflow/
├── src/
│   ├── types/
│   │   └── pipeline.ts          # NEW: Pipeline types
│   ├── lib/
│   │   ├── pipeline.ts          # NEW: State management
│   │   ├── events.ts            # NEW: Event logging
│   │   ├── failure.ts           # NEW: Failure classification
│   │   ├── notifications.ts     # NEW: Notification dispatch
│   │   └── pipeline-interceptor.ts  # NEW: Phase wrapping
│   ├── commands/
│   │   ├── pipeline-status.ts   # NEW: Pipeline visibility CLI
│   │   └── pipeline-run.ts      # RENAMED: Current pipeline.ts
│   └── index.ts                 # MODIFIED: Register commands
├── tests/
│   ├── lib/
│   │   ├── pipeline.test.ts     # NEW
│   │   ├── events.test.ts       # NEW
│   │   ├── failure.test.ts      # NEW
│   │   └── notifications.test.ts # NEW
│   └── integration/
│       └── pipeline-visibility.test.ts  # NEW
└── .specflow/
    ├── pipeline.json            # Runtime: State file
    ├── events.jsonl             # Runtime: Event log
    ├── config.json              # Runtime: Notification config
    └── .session                 # Runtime: Session ID
```

## Dependencies

### Internal Dependencies
- `src/types.ts` — Existing `SpecPhase`, `FeatureStatus` types
- `src/lib/database.ts` — Feature lookup for metrics
- Existing command implementations — Wrapped for interception

### External Dependencies
- None added (uses Bun stdlib)

### Runtime Dependencies
- `.specflow/` directory must exist (created by `initDatabase`)
- Write access to project directory

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **Atomic write failure** | High — corrupted state | Low | Use temp+rename; add checksum verification |
| **Hook timeout blocks pipeline** | Medium — slow transitions | Medium | Fire-and-forget with 5s timeout; log failures |
| **Watch mode CPU usage** | Low — battery drain | Medium | Use native `fs.watch` with 1s polling fallback |
| **Event log grows unbounded** | Low — disk space | Low | Add retention policy in Phase 6; default 30 days |
| **Breaking existing `pipeline` command** | High — user confusion | Medium | Rename to `pipeline run`; add deprecation notice |
| **Session ID collision** | Low — state confusion | Very Low | UUID v4 has negligible collision probability |
| **Concurrent writes corrupt state** | Medium — lost updates | Low | Single-writer model; warn if stale session detected |

### Stale Session Detection

When loading pipeline state, check if `session_id` differs from current session AND `updated_at` is recent (< 5 minutes). If so, emit warning:

```
Warning: Pipeline state was updated by another session 2 minutes ago.
Another agent may be running. Continue? [y/N]
```

In headless mode, skip warning and proceed (last-writer-wins).

## Open Questions (Resolved)

| Question | Resolution |
|----------|------------|
| Session ID generation | UUID v4 via `crypto.randomUUID()` |
| Event retention policy | 30 days default, configurable |
| Hook execution model | Sequential with 5s timeout each; fire-and-forget |

## Success Criteria Traceability

| Spec Criterion | Implementation | Verification |
|----------------|----------------|--------------|
| Pipeline file exists and updates | Phase 1 + 3 | Integration test |
| Inter-session visibility | Phase 1 | Integration test |
| Events are logged | Phase 1 | Unit test |
| Notifications fire | Phase 4 | Integration test |
| Failure classification works | Phase 2 | Unit test |
| CLI provides visibility | Phase 5 | Manual + unit test |
| Watch mode works | Phase 5 | Manual test |
| Retry mechanism works | Phase 5 | Integration test |

## Estimated Effort

| Phase | Effort | Dependencies |
|-------|--------|--------------|
| Phase 1: Core Data Layer | 4 hours | None |
| Phase 2: Failure Classification | 2 hours | Phase 1 |
| Phase 3: Phase Interceptor | 3 hours | Phase 1 |
| Phase 4: Notification System | 3 hours | Phase 1 |
| Phase 5: CLI Commands | 4 hours | Phases 1-4 |
| Phase 6: Integration Testing | 3 hours | Phases 1-5 |
| **Total** | **19 hours** | ~3 days |

## Appendix: Sample Outputs

### `specflow pipeline` (Table View)

```
Pipeline Status                                          Session: a1b2c3d4

Features in Pipeline:
ID       Phase       Status       Last Transition    Metrics
──────────────────────────────────────────────────────────────────────────
F-090    implement   in_progress  2 min ago          3/5 specs, 12/15 tests
F-089    review      pending      1 hour ago         complete

Active Failures:
Feature  Phase       Type           Message
──────────────────────────────────────────────────────────────────────────
F-088    implement   test_failure   2 specs failed typecheck

Commands:
  specflow pipeline clear F-088    # Acknowledge failure
  specflow pipeline retry F-088    # Reset to retry
```

### `specflow pipeline --json`

```json
{
  "version": 1,
  "updated_at": "2026-03-06T10:15:30Z",
  "project": "specflow-bundle",
  "session_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "features": [
    {
      "id": "F-090",
      "name": "orchestration-visibility",
      "phase": "implement",
      "status": "in_progress",
      "started_at": "2026-03-06T09:00:00Z",
      "last_transition": "2026-03-06T10:13:30Z",
      "session_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "blocked_reason": null,
      "metrics": {
        "specs_complete": 3,
        "specs_total": 5,
        "tests_passing": 12,
        "tests_total": 15
      }
    }
  ],
  "failures": []
}
```

### Sample Hook Script

```bash
#!/bin/bash
# .specflow/hooks/notify.sh
# Receives event as JSON on stdin

EVENT=$(cat)
TYPE=$(echo "$EVENT" | jq -r '.type')
FEATURE=$(echo "$EVENT" | jq -r '.feature_id // "N/A"')

case "$TYPE" in
  "phase.failed")
    # Send to voice server
    curl -s -X POST http://localhost:8888/notify \
      -H "Content-Type: application/json" \
      -d "{\"message\": \"Feature $FEATURE failed\", \"priority\": \"high\"}"
    ;;
  "gate.pending")
    # Desktop notification
    osascript -e "display notification \"$FEATURE awaiting review\" with title \"SpecFlow\""
    ;;
esac
```
