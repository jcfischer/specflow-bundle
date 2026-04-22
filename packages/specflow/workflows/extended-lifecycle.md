# Extended Lifecycle — HARDEN → REVIEW → APPROVE

Opt-in quality gates that run after IMPLEMENT and before a feature is marked DONE. Use when human approval is required before release (regulated, high-blast-radius, or multi-stakeholder features).

```
IMPLEMENT ──→ HARDEN ──→ REVIEW ──→ APPROVE ──→ DONE
                                    └──→ REJECT ──→ (return to IMPLEMENT)
```

---

## Phase 5 — Harden

Command: `specflow harden F-N`

Generates an acceptance-test template from the feature's `spec.md` success criteria:

- AI-generated or static-fallback template with `[x] PASS / [x] FAIL / [x] SKIP` checkboxes per criterion.
- A human fills the template with actual test results.
- Ingest with `specflow harden F-N --ingest`.
- Phase advances to REVIEW only when all tests pass (zero failures).

Output: `.specify/specs/F-N-<name>/acceptance-test.md`.

---

## Phase 6 — Review

Command: `specflow review F-N`

Compiles an evidence package for human review:

- Automated checks — `bun test` results, `tsc --noEmit` type-check results.
- File alignment — every backtick-referenced file in the spec/plan/tasks exists on disk.
- Acceptance-test summary (from HARDEN).
- Creates an approval gate and writes `review-package.md`.

Output: `.specify/specs/F-N-<name>/review-package.md`.

---

## Phase 7 — Approve / Reject

- `specflow approve F-N [F-N2 …]` — batch-approve pending gates, marks features complete.
- `specflow reject F-N --reason "<text>"` — writes `feedback.md` and returns the feature to IMPLEMENT.

---

## Inbox

Command: `specflow inbox`

Priority-ranked review queue:

- **P0** — features with failures or blocked status.
- **P1** — passed review, waiting <24h.
- **P2** — passed review, waiting ≥24h.

Suggests a batch `specflow approve …` command when clean items are ready.

---

## Audit

Command: `specflow audit [F-N]`

Detects spec-reality drift:

- DB-status consistency — phase vs. status alignment.
- Artifact completeness — expected files exist for the current phase.
- Spec-code alignment — backtick-referenced files actually exist in the repo.

Run `specflow audit` periodically or when `specflow status` looks off.
