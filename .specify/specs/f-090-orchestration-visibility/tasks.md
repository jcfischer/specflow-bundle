# Implementation Tasks: F-090 Orchestration Visibility

## Progress Tracking

| Task | Status | Notes |
|------|--------|-------|
| T-1.1 | ☐ | Pipeline types |
| T-1.2 | ☐ | Pipeline state management |
| T-1.3 | ☐ | Event logging |
| T-1.4 | ☐ | Session ID management |
| T-2.1 | ☐ | Failure classification |
| T-2.2 | ☐ | Failure routing |
| T-3.1 | ☐ | Notification config |
| T-3.2 | ☐ | Notification dispatch |
| T-3.3 | ☐ | Hook execution |
| T-4.1 | ☐ | Phase interceptor |
| T-4.2 | ☐ | Command integration |
| T-5.1 | ☐ | Rename existing pipeline command |
| T-5.2 | ☐ | Pipeline status command |
| T-5.3 | ☐ | Watch mode |
| T-5.4 | ☐ | Events subcommand |
| T-5.5 | ☐ | Clear/retry subcommands |
| T-6.1 | ☐ | Integration tests |

---

## Group 1: Core Data Layer

### T-1.1: Define pipeline types [T]
- **File:** `packages/specflow/src/types/pipeline.ts`
- **Test:** `packages/specflow/tests/types/pipeline.test.ts`
- **Dependencies:** none
- **Description:** Define TypeScript interfaces for pipeline state:
  - `PipelineState` — root state object with version, features, failures
  - `PipelineFeature` — feature tracking with phase, status, metrics
  - `PipelineMetrics` — spec/test counts
  - `PipelineFailure` — failure records with type, route, recovery status
  - `FailureType` — union type for failure categories
  - `FailureRoute` — union type for routing hints (auto-fix, retry, escalate)
  - Add Zod schemas for runtime validation of pipeline.json

### T-1.2: Implement pipeline state management [T]
- **File:** `packages/specflow/src/lib/pipeline.ts`
- **Test:** `packages/specflow/tests/lib/pipeline.test.ts`
- **Dependencies:** T-1.1
- **Description:** State file operations with atomic writes:
  - `loadPipelineState()` — read and parse `.specflow/pipeline.json`, return empty state if missing
  - `savePipelineState(state)` — atomic write via temp+rename pattern
  - `updateFeatureInPipeline(featureId, updates)` — partial update helper
  - `addFailureToPipeline(failure)` — append failure to state
  - `removeFeatureFromPipeline(featureId)` — remove completed feature
  - Ensure `.specflow/` directory exists before writes

### T-1.3: Implement event logging [T] [P with T-1.2]
- **File:** `packages/specflow/src/lib/events.ts`
- **Test:** `packages/specflow/tests/lib/events.test.ts`
- **Dependencies:** T-1.1
- **Description:** JSONL event log operations:
  - `PipelineEvent` type with all event types from spec
  - `emitEvent(event)` — append to `.specflow/events.jsonl` with timestamp and session_id
  - `readEvents(options)` — read events with optional filters:
    - `since: Date` — filter by timestamp
    - `limit: number` — max events to return
    - `type: PipelineEventType` — filter by event type
    - `featureId: string` — filter by feature
  - Tail-read optimization for large files (read last N lines)

### T-1.4: Implement session ID management [T] [P with T-1.2, T-1.3]
- **File:** `packages/specflow/src/lib/session.ts`
- **Test:** `packages/specflow/tests/lib/session.test.ts`
- **Dependencies:** T-1.1
- **Description:** Session tracking for inter-session visibility:
  - `getSessionId()` — read from `.specflow/.session` or generate UUID v4
  - `initSession()` — create session file with new UUID, emit `session.started` event
  - `endSession()` — emit `session.ended` event
  - `isStaleSession(state)` — check if another session updated state recently (< 5 min)
  - Use `crypto.randomUUID()` for generation

---

## Group 2: Failure Classification

### T-2.1: Implement failure classification [T]
- **File:** `packages/specflow/src/lib/failure.ts`
- **Test:** `packages/specflow/tests/lib/failure.test.ts`
- **Dependencies:** T-1.1
- **Description:** Classify errors into failure taxonomy:
  - `classifyFailure(error: string, exitCode: number): FailureType`
  - Pattern matchers for:
    - `typecheck` — "error TS", tsc exit codes
    - `lint` — eslint/prettier patterns
    - `test_failure` — "FAIL", bun test patterns
    - `acceptance_failure` — harden phase context
    - `timeout` — timeout exceeded messages
    - `dependency` — network errors, ECONNREFUSED
    - `validation` — spec/plan validation errors
    - `unknown` — fallback
  - Include real error output samples in tests

### T-2.2: Implement failure routing [T]
- **File:** `packages/specflow/src/lib/failure.ts` (extend)
- **Test:** `packages/specflow/tests/lib/failure.test.ts` (extend)
- **Dependencies:** T-2.1
- **Description:** Determine routing for failures:
  - `getFailureRoute(type: FailureType, retryCount: number): FailureRoute`
  - Logic:
    - `typecheck`, `lint` → `auto-fix`
    - `test_failure` → `retry` (first 2 attempts), then `escalate`
    - `timeout`, `dependency` → `retry` (with backoff hint)
    - `acceptance_failure`, `validation`, `unknown` → `escalate`
  - Return route with optional metadata (backoff_ms for retry)

---

## Group 3: Notification System

### T-3.1: Load notification configuration [T]
- **File:** `packages/specflow/src/lib/notifications.ts`
- **Test:** `packages/specflow/tests/lib/notifications.test.ts`
- **Dependencies:** T-1.1
- **Description:** Configuration loading:
  - `NotificationConfig` interface matching spec schema
  - `loadNotificationConfig()` — read from `.specflow/config.json`
  - Default config: file logging enabled, webhook disabled, empty hooks array
  - Validate config with Zod schema
  - Create config file with defaults if missing

### T-3.2: Implement notification dispatch [T]
- **File:** `packages/specflow/src/lib/notifications.ts` (extend)
- **Test:** `packages/specflow/tests/lib/notifications.test.ts` (extend)
- **Dependencies:** T-3.1, T-1.3
- **Description:** Event dispatch to backends:
  - `dispatchNotification(event: PipelineEvent): Promise<void>`
  - Always append to events.jsonl (via `emitEvent`)
  - POST to webhook if configured (with retry on 5xx)
  - Run hooks sequentially
  - Log failures but don't throw (fire-and-forget semantics)
  - Include `Content-Type: application/json` header for webhooks

### T-3.3: Implement hook execution [T]
- **File:** `packages/specflow/src/lib/notifications.ts` (extend)
- **Test:** `packages/specflow/tests/lib/notifications.test.ts` (extend)
- **Dependencies:** T-3.2
- **Description:** Shell hook runner:
  - `runHook(hookPath: string, event: PipelineEvent, timeout?: number): Promise<void>`
  - Use `Bun.spawn` with stdin pipe for event JSON
  - Default timeout: 5000ms
  - Kill process on timeout, log warning
  - Capture stderr for debugging on failure
  - Verify hook is executable before running

---

## Group 4: Phase Transition Interceptor

### T-4.1: Create phase interceptor [T]
- **File:** `packages/specflow/src/lib/pipeline-interceptor.ts`
- **Test:** `packages/specflow/tests/lib/pipeline-interceptor.test.ts`
- **Dependencies:** T-1.2, T-1.3, T-1.4, T-2.1, T-3.2
- **Description:** Higher-order function for phase wrapping:
  - `wrapPhaseExecution<T>(fn: () => Promise<T>, featureId: string, phase: SpecPhase): Promise<T>`
  - On entry:
    - Update pipeline.json (status: in_progress)
    - Emit `phase.started` event
  - On success:
    - Update pipeline.json (status: complete, metrics)
    - Emit `phase.completed` event with duration
  - On failure:
    - Classify error with `classifyFailure`
    - Add failure to pipeline.json
    - Emit `phase.failed` event with failure details
    - Dispatch notifications
  - Measure duration with `performance.now()`

### T-4.2: Integrate interceptor with commands [T]
- **File:** Multiple command files (see list below)
- **Test:** `packages/specflow/tests/lib/pipeline-interceptor.test.ts` (extend)
- **Dependencies:** T-4.1
- **Description:** Wrap existing commands with interceptor:
  - `packages/specflow/src/commands/specify.ts`
  - `packages/specflow/src/commands/plan.ts`
  - `packages/specflow/src/commands/tasks.ts`
  - `packages/specflow/src/commands/implement.ts`
  - `packages/specflow/src/commands/complete.ts`
  - `packages/specflow/src/commands/harden.ts` (if F-089 present)
  - `packages/specflow/src/commands/review.ts` (if F-089 present)
  - Pattern: wrap the main command body, not the CLI parsing

---

## Group 5: CLI Commands

### T-5.1: Rename existing pipeline command [T]
- **File:** `packages/specflow/src/commands/pipeline-run.ts`
- **Test:** `packages/specflow/tests/commands/pipeline-run.test.ts`
- **Dependencies:** none
- **Description:** Preserve existing orchestrator:
  - Rename `packages/specflow/src/commands/pipeline.ts` → `pipeline-run.ts`
  - Update command name to `pipeline run`
  - Add deprecation notice for bare `specflow pipeline <feature-id>` usage
  - Update CLI registration in `index.ts`

### T-5.2: Create pipeline status command [T]
- **File:** `packages/specflow/src/commands/pipeline-status.ts`
- **Test:** `packages/specflow/tests/commands/pipeline-status.test.ts`
- **Dependencies:** T-1.2, T-5.1
- **Description:** Main visibility command:
  - `specflow pipeline` — show table view of pipeline state
  - `specflow pipeline --json` — raw JSON output
  - Table format per spec appendix (Features, Failures, Commands hint)
  - Show session ID, last updated time
  - Handle empty state gracefully ("No features in pipeline")
  - Register as default subcommand under `pipeline` group

### T-5.3: Implement watch mode [T]
- **File:** `packages/specflow/src/commands/pipeline-status.ts` (extend)
- **Test:** `packages/specflow/tests/commands/pipeline-status.test.ts` (extend)
- **Dependencies:** T-5.2
- **Description:** Live-updating pipeline view:
  - `specflow pipeline --watch`
  - Use `fs.watch` on `.specflow/pipeline.json`
  - Fallback to 1s polling if watch unavailable
  - Clear terminal and redraw on changes
  - Show "Watching... (Ctrl+C to exit)" footer
  - Handle SIGINT gracefully

### T-5.4: Create events subcommand [T]
- **File:** `packages/specflow/src/commands/pipeline-events.ts`
- **Test:** `packages/specflow/tests/commands/pipeline-events.test.ts`
- **Dependencies:** T-1.3
- **Description:** Event log viewer:
  - `specflow pipeline events` — show last 20 events
  - `specflow pipeline events --since 1h` — filter by time (parse duration)
  - `specflow pipeline events --type phase.failed` — filter by event type
  - `specflow pipeline events --feature F-090` — filter by feature
  - `specflow pipeline events --json` — raw JSON output
  - Table format: timestamp, type, feature, summary

### T-5.5: Create clear/retry subcommands [T]
- **File:** `packages/specflow/src/commands/pipeline-control.ts`
- **Test:** `packages/specflow/tests/commands/pipeline-control.test.ts`
- **Dependencies:** T-1.2, T-1.3
- **Description:** Failure management commands:
  - `specflow pipeline clear <feature-id>` — acknowledge failure
    - Mark failure as `recovered: true`
    - Emit event
    - Exit 0 on success, 1 if no failure found
  - `specflow pipeline retry <feature-id>` — reset for retry
    - Clear failure
    - Reset feature status to `pending` in current phase
    - Emit `phase.started` event
    - Exit 0 on success, 1 if feature not found

---

## Group 6: Integration Testing

### T-6.1: Create integration tests [T]
- **File:** `packages/specflow/tests/integration/pipeline-visibility.test.ts`
- **Test:** N/A (is test file)
- **Dependencies:** T-1.1 through T-5.5
- **Description:** End-to-end verification:
  - Test full pipeline run with visibility tracking
  - Test failure scenarios:
    - Typecheck failure → classified correctly
    - Test failure → retry then escalate
    - Timeout → retry route
  - Test inter-session visibility:
    - Session A writes state
    - Session B reads and continues
  - Test notification dispatch:
    - Mock webhook receives events
    - Hook script executed with correct payload
  - Test retry/clear workflows:
    - Failure → clear → feature proceeds
    - Failure → retry → phase restarts
  - Use temp directories for isolation

---

## Execution Order

```
Phase 1 (Foundation):
  T-1.1 ──┬──> T-1.2 ──┐
          ├──> T-1.3 ──┤
          └──> T-1.4 ──┘

Phase 2 (Classification):
  T-1.1 ──> T-2.1 ──> T-2.2

Phase 3 (Notifications):
  T-1.1 ──> T-3.1 ──> T-3.2 ──> T-3.3
            T-1.3 ──┘

Phase 4 (Interceptor):
  T-1.2, T-1.3, T-1.4, T-2.1, T-3.2 ──> T-4.1 ──> T-4.2

Phase 5 (CLI):
  T-5.1 (can start immediately)
  T-1.2 + T-5.1 ──> T-5.2 ──> T-5.3
  T-1.3 ──> T-5.4
  T-1.2 + T-1.3 ──> T-5.5

Phase 6 (Integration):
  All ──> T-6.1
```

**Parallelizable sets:**
- T-1.2, T-1.3, T-1.4 (after T-1.1)
- T-2.1, T-3.1 (after T-1.1)
- T-5.1 (independent)
- T-5.4, T-5.5 (after their deps)

---

## Estimated Effort

| Task | Effort | Notes |
|------|--------|-------|
| T-1.1 | 1h | Types + Zod schemas |
| T-1.2 | 1.5h | Atomic file operations |
| T-1.3 | 1h | JSONL parsing |
| T-1.4 | 0.5h | UUID generation |
| T-2.1 | 1h | Pattern matching |
| T-2.2 | 0.5h | Routing logic |
| T-3.1 | 0.5h | Config loading |
| T-3.2 | 1h | Dispatch logic |
| T-3.3 | 1h | Process spawning |
| T-4.1 | 1.5h | HOF with error handling |
| T-4.2 | 1h | Command modifications |
| T-5.1 | 0.5h | File rename + CLI |
| T-5.2 | 1h | Table formatting |
| T-5.3 | 1h | File watching |
| T-5.4 | 1h | Event filtering |
| T-5.5 | 1h | Control commands |
| T-6.1 | 2h | Integration scenarios |
| **Total** | **16h** | ~2 days |
