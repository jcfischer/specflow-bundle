# Handling Time Pressure

SpecFlow enforces gated phases. If the user signals time pressure, do NOT silently skip phases. ASK explicitly using this dialog:

```
SpecFlow requires full spec / plan / tasks for each feature. Options:

  1. Full SpecFlow for 2–3 features instead of 8.
  2. Skip SpecFlow and code directly (no gates, no quality eval).
  3. Hybrid: full specs for core features only; lightweight for the rest.

Which approach would you prefer?
```

## Behaviour by answer

- **Option 1** — proceed normally, but help the user prioritise which features drop.
- **Option 2** — acknowledge explicitly; log the decision in `.specify/debt-ledger.md` so the skip is auditable; proceed without invoking SpecFlow phases.
- **Option 3** — tag each feature in `specflow status` with `--priority high` for full-spec features and `--priority low` for lightweight.

## Quick-start mode

As a middle path, `specflow specify F-N --quick` reduces the interview depth and drops the quality gate threshold to 60%. Use this when speed matters but gates still have value.

## Never

- Advance to IMPLEMENT without spec + plan + tasks files existing, even under time pressure.
- Skip the `git checkout -b spec/F-N-<name>` branch step.
