# SpecFlow Directory Layout

```
project-root/
├── .specflow/
│   └── features.db              # Feature queue (SQLite)
├── .specify/
│   ├── memory/
│   │   └── constitution.md      # Project principles
│   ├── debt-ledger.md           # Accumulated tech debt
│   └── specs/
│       └── F-N-<name>/
│           ├── spec.md              # SPECIFY output — what & why
│           ├── plan.md              # PLAN output — how
│           ├── tasks.md             # TASKS output — work items
│           ├── docs.md              # User-facing documentation
│           ├── verify.md            # Verification evidence
│           ├── acceptance-test.md   # (extended lifecycle, HARDEN)
│           ├── review-package.md    # (extended lifecycle, REVIEW)
│           └── feedback.md          # (on rejection)
└── src/                             # Implementation code
```

## Notes

- `.specflow/features.db` — SQLite, managed by the CLI. Do not edit by hand.
- `.specify/specs/F-N-<name>/` — one directory per feature. Kebab-case the name.
- `docs.md` + `verify.md` are required for `specflow complete` to succeed.
- Extended lifecycle artefacts (`acceptance-test.md`, `review-package.md`, `feedback.md`) appear only if you opt into HARDEN/REVIEW/APPROVE.
