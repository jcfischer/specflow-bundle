# SpecFlow Bundle

**Spec-Driven Development for AI Infrastructure**

Build complex multi-tool systems with confidence. Define specifications, track dependencies, verify contracts, and visualize progress.

## What's Included

| Package | Purpose |
|---------|---------|
| **SpecKit** | Specification-driven development with gated phases |
| **SpecFlow** | CLI orchestration and feature management |
| **specflow-ui** | Web dashboard for progress visualization |
| **pai-deps** | Dependency tracking and contract verification |

## The Problem

Building AI infrastructure involves dozens of interconnected tools. Without discipline:
- Specs drift from implementation
- Changes break downstream tools silently
- No visibility into what's done vs. what's promised
- Dependencies become a tangled mess

## The Solution

```
SPECIFY → PLAN → TASKS → IMPLEMENT
```

**SpecKit** enforces a gated workflow where each phase must be validated before advancing:

1. **SPECIFY** - Define what you're building and why (requirements, success criteria)
2. **PLAN** - Design how to build it (architecture, data models, contracts)
3. **TASKS** - Break into reviewable units with dependencies
4. **IMPLEMENT** - Build with TDD enforcement (RED → GREEN → BLUE)

**pai-deps** ensures your implementation doesn't break existing tools:
- Tracks what depends on what
- Validates CLI and MCP contracts
- Calculates blast radius before changes
- Pre-commit hooks catch breaking changes

**specflow-ui** gives you visibility:
- Dashboard showing all projects and features
- Phase progress visualization
- Feature completion tracking

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) runtime
- [Claude Code](https://claude.ai/claude-code) CLI

### Installation

```bash
# Clone with submodules
git clone --recursive https://github.com/jcfischer/specflow-bundle.git
cd specflow-bundle

# Install all packages
cd packages/pai-deps && bun install && cd ..
cd speckit && bun install && cd ..
cd specflow && bun install && cd ..
cd specflow-ui && bun install && cd ..
```

### For Claude Code Users

Copy the skills to your Claude skills directory:

```bash
cp -r packages/speckit ~/.claude/skills/SpecKit
cp -r packages/specflow ~/.claude/skills/SpecFlow
```

Then use in Claude Code:
- `/speckit.specify` - Start a new feature spec
- `/speckit.plan` - Create implementation plan
- `/speckit.tasks` - Generate task breakdown
- `/speckit.implement` - Execute implementation
- `specflow status` - Check feature progress
- `specflow ui` - Launch dashboard

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    specflow-ui                          │
│              (Progress Dashboard)                       │
│         http://localhost:3000                           │
└─────────────────────┬───────────────────────────────────┘
                      │ reads
                      ▼
┌─────────────────────────────────────────────────────────┐
│                    SpecFlow                             │
│              (CLI Orchestration)                        │
│    specflow init | status | run | complete              │
└─────────────────────┬───────────────────────────────────┘
                      │ manages
                      ▼
┌─────────────────────────────────────────────────────────┐
│                    SpecKit                              │
│           (Spec-Driven Workflow)                        │
│   /speckit.specify → plan → tasks → implement           │
└─────────────────────┬───────────────────────────────────┘
                      │ validates against
                      ▼
┌─────────────────────────────────────────────────────────┐
│                    pai-deps                             │
│           (Dependency Registry)                         │
│   pai-deps verify | blast-radius | health               │
└─────────────────────────────────────────────────────────┘
```

## Example Workflow

```bash
# 1. Initialize a project
specflow init my-project

# 2. Add a feature
specflow add "User authentication"

# 3. Work through phases (in Claude Code)
/speckit.specify   # Define requirements
/speckit.plan      # Design architecture
/speckit.tasks     # Create task breakdown
/speckit.implement # Build with TDD

# 4. Check progress
specflow status

# 5. Verify no dependencies broken
pai-deps verify
pai-deps blast-radius my-tool

# 6. Launch dashboard
specflow ui --port 3000
```

## Support Development

This bundle is **free and open source** under the MIT license.

If SpecFlow Bundle helps you build better AI infrastructure, consider supporting continued development:

- [Support on InVisible Store](https://invisible.ch/support.html)
- [GitHub Sponsors](https://github.com/sponsors/jcfischer)

Your support funds new features, documentation, and maintenance.

## License

MIT License - Use it, modify it, build on it.

## Links

- [InVisible GmbH](https://invisible.ch) - Company behind SpecFlow Bundle
- [Supertag CLI](https://invisible.ch/supertag/) - Our Tana CLI tool
- [pai-deps](https://github.com/jcfischer/pai-deps) - Dependency management

---

Built with 35+ years of experience in complex IT environments.
