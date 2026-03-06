# F-090: Orchestration Visibility

## Problem & Pain

When SpecFlow features run autonomously (via ivy-heartbeat or shell scripts), there's no visibility into pipeline state across sessions and no structured notification when intervention is needed. Specific gaps:

1. **No inter-session visibility** — when an agent session ends mid-pipeline, the next session has no structured way to see what phase the feature was in, what failed, or what's pending. Operators must manually inspect database state or guess.

2. **No phase transition notifications** — features move through phases silently. Humans only discover state changes by actively polling or running `specflow status`. In an exception-based model, this is backwards—the system should notify humans only when attention is needed.

3. **No failure routing** — when a phase fails, there's no mechanism to route the failure to appropriate handlers. A typecheck failure might need different handling than an acceptance test failure, but currently both just leave the feature in a stuck state.

4. **No unified progress view** — with multiple features across multiple projects, operators have no single view of what's moving, what's blocked, and what succeeded. They must context-switch to each project and run status commands.

These gaps undermine the "management-by-exception" model where agents work autonomously and humans only intervene at gates or failures.

## Users & Context

**Primary user:** Technical users operating SpecFlow in autonomous/headless pipelines, particularly Jens-Christian running PAI with ivy-heartbeat dispatching work.

**Usage context:**
- Multiple features in-flight across different projects simultaneously
- Agent sessions may terminate and resume (session boundaries are arbitrary)
- Human attention is scarce—notifications should be exception-based, not constant
- Integration with external notification systems (PAI voice, desktop, webhooks) is required
- Current pain: no idea what's happening until you go look

## Constraints

- Must integrate with F-089's lifecycle phases (HARDEN, REVIEW, APPROVE) if present
- Pipeline file must be atomic (no partial writes) and human-readable
- Notification backends are pluggable—core provides the interface, not the implementations
- No polling loops in core—this is a producer of events, not a consumer
- Must work without external dependencies (degraded mode with file-only visibility)
- CLI-first: observability via `specflow pipeline` subcommands

## Solution

### Component 1: Pipeline Progress File

A structured JSON file at `.specflow/pipeline.json` that records current state of all in-flight work. Updated atomically on every phase transition.

**Schema:**
```json
{
  "version": 1,
  "updated_at": "2026-03-06T10:15:30Z",
  "project": "specflow-bundle",
  "features": [
    {
      "id": "F-090",
      "name": "orchestration-visibility",
      "phase": "implement",
      "status": "in_progress",
      "started_at": "2026-03-06T09:00:00Z",
      "last_transition": "2026-03-06T10:15:30Z",
      "session_id": "abc123",
      "blocked_reason": null,
      "metrics": {
        "specs_complete": 3,
        "specs_total": 5,
        "tests_passing": 12,
        "tests_total": 15
      }
    }
  ],
  "failures": [
    {
      "feature_id": "F-088",
      "phase": "implement",
      "failure_type": "test_failure",
      "message": "2 specs failed typecheck",
      "occurred_at": "2026-03-06T08:45:00Z",
      "recovered": false
    }
  ]
}
```

**Update triggers:**
- Phase transitions (specify → plan → tasks → implement → etc.)
- Status changes (pending → in_progress → complete/blocked)
- Test/check completions
- Failure events

### Component 2: Notification Interface

Abstract notification interface that core invokes on significant events. Implementations are external (loaded via hook or config).

**Event types:**
| Event | Trigger | Payload |
|-------|---------|---------|
| `phase.started` | Feature enters new phase | feature_id, phase, timestamp |
| `phase.completed` | Feature exits phase successfully | feature_id, phase, duration, metrics |
| `phase.failed` | Phase fails with error | feature_id, phase, failure_type, message |
| `gate.pending` | Feature awaiting human decision | feature_id, gate_type (review/approve) |
| `gate.resolved` | Human resolves gate | feature_id, gate_type, decision, by |
| `pipeline.blocked` | Pipeline has unrecoverable failure | feature_id, reason |
| `pipeline.clear` | All features complete or resolved | summary_metrics |

**Notification backends (examples, implemented externally):**
- File: append to `.specflow/events.jsonl` (always enabled, audit trail)
- Webhook: POST to configured URL
- Desktop: macOS notification via osascript
- Voice: POST to PAI voice server
- Blackboard: write to ivy-blackboard for cross-project visibility

**Configuration:**
```json
{
  "notifications": {
    "file": { "enabled": true, "path": ".specflow/events.jsonl" },
    "webhook": { "enabled": false, "url": null },
    "hooks": ["./hooks/notify.sh"]
  }
}
```

### Component 3: Failure Recovery Routing

Structured failure classification with routing hints. Failures are categorized so external systems can route appropriately.

**Failure taxonomy:**
| Category | Examples | Default Route |
|----------|----------|---------------|
| `typecheck` | TypeScript errors | Auto-fix candidate |
| `lint` | ESLint/Prettier errors | Auto-fix candidate |
| `test_failure` | Unit tests fail | Needs investigation |
| `acceptance_failure` | Harden tests fail | Human review |
| `timeout` | Phase exceeded time limit | Retry or escalate |
| `dependency` | External service unavailable | Retry later |
| `validation` | Spec validation failed | Human input needed |
| `unknown` | Unclassified error | Human review |

**Routing behavior:**
- `auto-fix`: Emit event, allow automated retry/fix attempt
- `retry`: Emit event with backoff hint, allow scheduler to retry
- `escalate`: Emit high-priority notification, mark feature blocked

### CLI Commands

| Command | Description |
|---------|-------------|
| `specflow pipeline` | Show current pipeline state (from pipeline.json) |
| `specflow pipeline --watch` | Live-updating pipeline view |
| `specflow pipeline --json` | Raw JSON output |
| `specflow pipeline events` | Show recent events from events.jsonl |
| `specflow pipeline events --since 1h` | Filter events by time |
| `specflow pipeline clear F-N` | Clear failure for feature (acknowledge) |
| `specflow pipeline retry F-N` | Reset feature to retry failed phase |

## Implementation Notes

### Atomic File Updates

Pipeline file uses write-to-temp + rename pattern:
```typescript
const tmpPath = `${pipelinePath}.tmp.${Date.now()}`;
await writeFile(tmpPath, JSON.stringify(state, null, 2));
await rename(tmpPath, pipelinePath);
```

### Session Tracking

Each agent session generates a unique session_id (UUID). The pipeline file records which session last touched each feature, enabling:
- Detecting orphaned work (session died mid-phase)
- Correlating events across session boundaries
- Debugging "what happened while I was away"

### Hook Integration

Notifications invoke hooks synchronously but with timeout:
```typescript
const hooks = config.notifications.hooks || [];
for (const hook of hooks) {
  await runWithTimeout(hook, event, 5000); // 5s max
}
```

Hook failures are logged but don't block phase transitions.

## Non-Functional Requirements

- **Latency**: Pipeline file update < 50ms (must not slow down phase transitions)
- **Reliability**: File writes are atomic; no partial state on crash
- **Observability**: All events logged to events.jsonl regardless of notification config
- **Backwards compatibility**: Existing workflows work without configuration; pipeline.json is created automatically on first phase transition

## Success Criteria

1. **Pipeline file exists and updates**: After any phase transition, `.specflow/pipeline.json` reflects current state
2. **Inter-session visibility works**: New session can read pipeline.json and understand what's in flight, blocked, or complete
3. **Events are logged**: Every phase transition and failure appears in `events.jsonl`
4. **Notifications fire**: Configured hooks/webhooks receive events on phase transitions
5. **Failure classification works**: Failures are tagged with category and route hint
6. **CLI provides visibility**: `specflow pipeline` shows human-readable state summary
7. **Watch mode works**: `specflow pipeline --watch` updates live as events occur
8. **Retry mechanism works**: `specflow pipeline retry F-N` resets feature to retry failed phase

## Assumptions

- [TO BE CLARIFIED] Session ID generation mechanism—UUID v4 or derive from process/timestamp?
- [TO BE CLARIFIED] Event retention policy for events.jsonl—rotate after N days/MB, or keep forever?
- [TO BE CLARIFIED] Hook execution model—parallel or sequential? Fire-and-forget or wait?

## Relationship to F-089

F-089 introduced the extended lifecycle (HARDEN, REVIEW, APPROVE) but explicitly excluded notifications and pipeline visibility:

> **Anti-Requirements (F-089):**
> - No notification system — notifications are project-specific and should be layered via hooks
> - No autorun orchestrator — that's the responsibility of the caller

F-090 provides the notification and visibility layer that F-089 deferred. The two features are complementary:
- F-089: Extended state machine (what phases exist)
- F-090: Visibility and notification (how to observe and be notified of transitions)

## Prior Art

- **BloopAI/vibe-kanban** — Exception-based HITL with WebSocket progress broadcasting, approval service, notification service. Analyzed by mellanon in `research/2026-02-02-vibe-kanban-orchestration-analysis.md` (commit `f0163dd` on mellanon fork).
- **mellanon's F-11 through F-15** — Proposed orchestration features for pipeline progress file, phase transition notifications, approval gates, execution logging, and phase hooks.

## Scope

### In Scope
- Pipeline progress file (pipeline.json) with atomic updates
- Event log (events.jsonl) for audit trail
- Notification interface with hook/webhook support
- Failure taxonomy and routing hints
- CLI commands for pipeline visibility
- Session tracking for inter-session visibility

### Out of Scope
- Notification backend implementations (voice, desktop)—these are external
- Scheduling/orchestration logic—ivy-heartbeat handles that
- Cross-project aggregation—that's ivy-blackboard's job
- Auto-fix implementations—this feature classifies, doesn't fix
- Dashboard UI—CLI only for now
