# Feature Decomposition

## Context & Motivation

Decomposition transforms a monolithic specification into independently implementable units. This enables parallel development, isolated testing, and clearer progress tracking. Well-decomposed features reduce integration risk by 40-60% through chain reliability analysis. Each feature becomes a self-contained work unit with clear boundaries and dependencies.

## Application Specification

{{APP_SPEC}}

## Instructions

Analyze the specification and identify 5-20 independent features. Apply these criteria:

1. **Self-contained** — Implementable and testable in isolation
2. **Valuable** — Delivers user-visible functionality
3. **Testable** — Has clear acceptance criteria
4. **Right-sized** — Fits one focused session (30-60 minutes)

### Decomposition Guidelines

- **Foundation first**: Data models, schemas, and core utilities get priority 1
- **Dependencies flow forward**: Lower priority numbers implement first
- **List direct dependencies only**: Omit transitive dependencies
- **User-facing features last**: UI depends on backend functionality
- **Appropriate granularity**: Each feature delivers meaningful value (avoid "add a field" or "write one function")

## Examples

### Good Decomposition

For a "Task Management CLI":

```json
[
  {
    "id": "F-1",
    "name": "Core data model",
    "description": "Task and Tag SQLite schemas with CRUD operations",
    "dependencies": [],
    "priority": 1,
    "reliability": 95,
    "problemType": "impossible",
    "urgency": "blocking_work",
    "primaryUser": "developers",
    "integrationScope": "standalone"
  },
  {
    "id": "F-2",
    "name": "Add task command",
    "description": "CLI command to create tasks with title, description, due date",
    "dependencies": ["F-1"],
    "priority": 2,
    "reliability": 90,
    "problemType": "manual_workaround",
    "urgency": "user_demand",
    "primaryUser": "end_users",
    "integrationScope": "extends_existing"
  },
  {
    "id": "F-3",
    "name": "List tasks command",
    "description": "Display tasks with filtering by status, tag, due date",
    "dependencies": ["F-1"],
    "priority": 2,
    "reliability": 90,
    "problemType": "manual_workaround",
    "urgency": "user_demand",
    "primaryUser": "end_users",
    "integrationScope": "extends_existing"
  }
]
```

**Why this works:**
- F-1 has no dependencies → foundation feature with priority 1
- F-2 and F-3 depend only on F-1 → can be implemented in parallel (both priority 2)
- Each feature is independently testable and delivers user value

### Poor Decomposition (Avoid)

| Feature | Problem |
|---------|---------|
| "Add validation to name field" | Too granular — not independently valuable |
| "Build entire authentication system" | Too large — should split into login, registration, password reset |
| "F-5 depends on F-2, F-3, F-4" | Over-coupled — restructure to reduce dependencies |

## Rich Decomposition Fields

Include these fields to enable batch specification mode:

### Required Fields

**problemType** — What problem does this solve?
- `manual_workaround`: Users handle this manually (painful/slow)
- `impossible`: Users cannot accomplish this today
- `scattered`: Multiple tools/processes need unification
- `quality_issues`: Current approach causes errors/inconsistency

**urgency** — Why solve this now?
- `external_deadline`: Regulation, contract, or market timing
- `growing_pain`: Problem worsens as usage increases
- `blocking_work`: Other priorities blocked until resolved
- `user_demand`: Users explicitly requesting this

**primaryUser** — Who uses this feature?
- `developers`: Technical users building or integrating
- `end_users`: Non-technical application users
- `admins`: System administrators or operations team
- `mixed`: Multiple user types with different needs

**integrationScope** — How does it integrate?
- `standalone`: Completely new, minimal dependencies
- `extends_existing`: Adds to an existing feature or module
- `multiple_integrations`: Connects several internal systems
- `external_apis`: Requires third-party service integration

### Optional Fields

Include when determinable from the specification:
- `usageContext`: "daily" | "occasional" | "one_time" | "emergency"
- `dataRequirements`: "existing_only" | "new_model" | "external_data" | "user_generated"
- `performanceRequirements`: "realtime" | "interactive" | "background" | "none"
- `priorityTradeoff`: "speed" | "quality" | "completeness" | "ux"

### Handling Uncertainty

When a field's value cannot be determined from the spec:

```json
{
  "id": "F-3",
  "name": "Export functionality",
  "uncertainties": ["primaryUser", "performanceRequirements"],
  "clarificationNeeded": "Clarify whether admins or end users trigger exports, and if real-time response is required"
}
```

## Reliability Estimation

Estimate each feature's implementation reliability (0-100%):

| Reliability | Characteristics |
|-------------|-----------------|
| **95%** | Pure internal logic, no external dependencies |
| **90%** | Simple external dependency (file system, local DB) |
| **85%** | Single external API |
| **80%** | Multiple external APIs or complex integrations |
| **75%** | Real-time external dependencies or fragile integrations |

## Chain Reliability Analysis

After decomposing, analyze dependency chains to identify risk:

```
Chain Reliability = Product of individual feature reliabilities

Example:
F-1 (95%) → F-2 (90%) → F-5 (85%) = 0.95 × 0.90 × 0.85 = 72.7%
```

### Risk Thresholds

| Compound Reliability | Risk Level | Action |
|---------------------|------------|--------|
| **>80%** | Low | Proceed normally |
| **60-80%** | Moderate ⚠️ | Add error boundaries at chain transitions |
| **<60%** | High 🔴 | Restructure to reduce depth or add circuit breakers |

### Mitigation Strategies

For high-risk chains:
1. Add circuit breakers at chain depth > 3
2. Prefer fan-out (parallel features) over deep sequential chains
3. Add explicit error boundaries between features
4. Implement caching/fallback for external dependencies

## Output Format

Return a JSON object with two sections:

```json
{
  "features": [
    {
      "id": "F-1",
      "name": "Short feature name",
      "description": "What this feature does and why it matters",
      "dependencies": [],
      "priority": 1,
      "reliability": 95,
      "externalDeps": [],
      "problemType": "manual_workaround",
      "urgency": "blocking_work",
      "primaryUser": "developers",
      "integrationScope": "standalone"
    }
  ],
  "chainAnalysis": {
    "maxDepth": 4,
    "riskiestChain": "F-1 → F-2 → F-5 → F-8",
    "compoundReliability": 68.5,
    "recommendation": "Add circuit breaker between F-5 and F-8"
  }
}
```

## Completion Criteria

**Success indicators:**
- 5-20 features identified (fewer suggests over-grouping, more suggests over-splitting)
- All features have required fields populated
- Dependencies form a directed acyclic graph (no cycles)
- Chain reliability analysis completed with mitigations for high-risk chains
- Uncertainties explicitly marked rather than guessed

**Review triggers:**
- Fewer than 5 features — consider if spec is too simple for SpecFlow
- More than 20 features — consider grouping related features
- Any chain with <60% compound reliability — restructure before proceeding

Now decompose the provided application specification.
