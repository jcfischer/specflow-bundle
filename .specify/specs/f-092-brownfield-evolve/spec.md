# Specification: brownfield-evolve

## Overview

Brownfield iteration support via an EVOLVE phase that enables mature projects to iterate on existing specifications. The workflow snapshots the current spec as a versioned baseline, scans the actual codebase state, performs AI-assisted diff classification between the spec baseline and implementation reality, and applies approved deltas to create a new spec version. This solves the v1→v1.1 problem where projects have working implementations that have drifted from their original specifications.

## Problem Statement

Technical users working on mature projects face a gap: their codebase has evolved beyond the original specification through bug fixes, minor enhancements, and organic changes. Currently, there is no tooling to:
1. Capture the current spec as a versioned baseline
2. Detect divergence between spec and implementation
3. Classify and approve changes to bring spec back in sync
4. Produce a new spec version reflecting approved reality

This problem intensifies as projects mature and accumulate implementation drift.

## User Scenarios

### Scenario 1: Snapshot Current Spec as Baseline
- **Given** a feature with an existing specification at phase `complete`
- **When** the user runs `specflow evolve init <feature-id>`
- **Then** the current spec is copied to a versioned baseline (e.g., `spec.v1.md`)
- **And** a new working spec is created for evolution
- **And** the feature phase transitions to `evolve`

### Scenario 2: Scan Codebase for Implementation State
- **Given** a feature in `evolve` phase with a versioned baseline
- **When** the user runs `specflow evolve scan <feature-id>`
- **Then** the system analyzes implementation files associated with the feature
- **And** extracts behavioral patterns, API signatures, and test coverage
- **And** produces a structured implementation snapshot

### Scenario 3: AI-Assisted Diff Classification
- **Given** a spec baseline and implementation snapshot
- **When** the user runs `specflow evolve diff <feature-id>`
- **Then** the system identifies divergences between spec and reality
- **And** classifies each divergence as: `cosmetic`, `enhancement`, `bugfix`, `drift`, or `breaking`
- **And** presents divergences for user review with recommended actions

### Scenario 4: Apply Approved Deltas
- **Given** a list of classified divergences with user approvals
- **When** the user runs `specflow evolve apply <feature-id>`
- **Then** approved deltas are merged into the working spec
- **And** rejected deltas are logged for future reference
- **And** the spec version is incremented (v1 → v1.1)

### Scenario 5: Complete Evolution Cycle
- **Given** all divergences have been processed (approved or rejected)
- **When** the user runs `specflow evolve complete <feature-id>`
- **Then** the working spec becomes the new canonical spec
- **And** the feature phase returns to `complete`
- **And** evolution history is recorded for audit

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | `evolve init` command creates versioned baseline from current spec | High |
| FR-2 | Spec versioning follows semantic pattern (v1, v1.1, v1.2, v2) | High |
| FR-3 | `evolve scan` extracts implementation state from source files | High |
| FR-4 | Implementation scanner supports TypeScript/JavaScript codebases | High |
| FR-5 | `evolve diff` produces structured divergence report | High |
| FR-6 | Divergence classification uses AI assistance (Claude API) | High |
| FR-7 | Each divergence includes: location, category, severity, recommendation | Medium |
| FR-8 | `evolve apply` merges approved deltas into working spec | High |
| FR-9 | Delta application preserves spec structure and formatting | Medium |
| FR-10 | `evolve complete` finalizes version and updates feature state | High |
| FR-11 | Evolution history stored in feature metadata for audit trail | Medium |
| FR-12 | `evolve status` shows current evolution state and pending divergences | Medium |
| FR-13 | `evolve abort` cancels evolution and restores original spec | Medium |

## Non-Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| NFR-1 | Scan operation completes within 30 seconds for typical feature scope | Medium |
| NFR-2 | Diff classification provides confidence scores for each divergence | Medium |
| NFR-3 | Evolution state persists across CLI sessions | High |
| NFR-4 | All operations are idempotent and resumable | High |
| NFR-5 | [TO BE CLARIFIED] Maximum codebase size for scan operation | Low |

## Data Model

### Evolution State
```
evolution_records (new table)
├── feature_id: string (FK)
├── baseline_version: string (e.g., "v1")
├── target_version: string (e.g., "v1.1")
├── started_at: timestamp
├── completed_at: timestamp | null
├── status: "active" | "completed" | "aborted"
└── divergence_summary: JSON
```

### Divergence Record
```
divergences (new table)
├── id: string (UUID)
├── evolution_id: string (FK)
├── category: "cosmetic" | "enhancement" | "bugfix" | "drift" | "breaking"
├── severity: "low" | "medium" | "high"
├── spec_location: string (line reference in baseline)
├── impl_location: string (file:line in codebase)
├── description: string
├── recommendation: "accept" | "reject" | "modify"
├── confidence: number (0-1)
├── user_decision: "approved" | "rejected" | null
└── applied_at: timestamp | null
```

## Command Interface

```
specflow evolve init <feature-id>     # Start evolution, create baseline
specflow evolve scan <feature-id>     # Scan implementation state
specflow evolve diff <feature-id>     # Generate divergence report
specflow evolve review <feature-id>   # Interactive divergence review
specflow evolve apply <feature-id>    # Apply approved deltas
specflow evolve complete <feature-id> # Finalize new spec version
specflow evolve status <feature-id>   # Show evolution progress
specflow evolve abort <feature-id>    # Cancel and restore baseline
specflow evolve history <feature-id>  # Show version history
```

## Success Criteria

- [ ] User can snapshot any completed feature spec as a versioned baseline
- [ ] Scanner correctly identifies implementation files for a feature
- [ ] AI diff produces actionable divergence classifications
- [ ] Approved deltas merge cleanly into spec without manual editing
- [ ] Version history is preserved and auditable
- [ ] Existing `specflow complete` workflow remains unaffected (backwards compatible)
- [ ] Full evolution cycle (init → scan → diff → apply → complete) works end-to-end

## Prior Art

- **mellanon's EVOLVE phase** — 8-phase lifecycle with EVOLVE as Phase 8, brownfield scan/diff/apply workflow. Documented in `docs/LIFECYCLE.md` (commit `d8d2a47` on mellanon fork).
- **OpenSpec principles** — Delta spec analysis for brownfield development, referenced in mellanon's research (`research/2026-02-02-openspec-deep-dive.md`).

## Assumptions

1. Features to be evolved are in `complete` phase with valid specs
2. Implementation files are discoverable via existing feature metadata or conventions
3. Claude API is available for diff classification (graceful degradation if unavailable)
4. Users understand semantic versioning concepts

## Open Questions

- [TO BE CLARIFIED] How are implementation files associated with a feature? By convention, explicit mapping, or heuristic scan?
- [TO BE CLARIFIED] Should diff classification work offline with local LLM fallback?
- [TO BE CLARIFIED] What is the merge strategy when approved deltas conflict with each other?
- [TO BE CLARIFIED] How does this interact with the existing harden/review/approve lifecycle (F-089)?

## Out of Scope

- Automatic implementation changes (this only evolves the spec, not code)
- Multi-feature evolution in a single operation
- Git integration for version tracking (uses internal versioning)
- Visual diff tooling (CLI-only for initial implementation)
