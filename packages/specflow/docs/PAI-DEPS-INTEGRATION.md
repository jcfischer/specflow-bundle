# pai-deps Integration

For projects registered with `pai-deps`, use these commands to get dependency context and failure analysis. This integration helps populate critical sections in spec.md and plan.md.

## During SPECIFY Phase

Before writing spec.md, get system context:

```bash
pai-deps speckit context <tool-name>
```

This outputs:
- Upstream dependencies (what this tool depends on)
- Downstream dependencies (what depends on this tool)
- Integration points and contracts

**Use output to populate the "System Context" section in spec.md.**

## During PLAN Phase

Before writing plan.md, get failure modes:

```bash
pai-deps speckit failures <tool-name>
```

This outputs:
- How changes might break dependent tools
- Blast radius analysis
- Failure propagation paths

**Use output to populate the "Failure Mode Analysis" section in plan.md.**

## When to Use

| Situation | Command |
|-----------|---------|
| New tool/feature in PAI ecosystem | Both commands |
| Modifying existing registered tool | Both commands |
| Standalone project (not in pai-deps) | Skip - not applicable |

## Example Workflow

```bash
# 1. Check if tool is registered
pai-deps show my-tool

# 2. Before SPECIFY phase
pai-deps speckit context my-tool > /tmp/context.md
# Review and incorporate into spec.md System Context section

# 3. Before PLAN phase
pai-deps speckit failures my-tool > /tmp/failures.md
# Review and incorporate into plan.md Failure Mode Analysis section
```
