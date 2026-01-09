# Feature Decomposition Prompt

You are decomposing an application specification into independent, implementable features.

## Input

**Application Specification:**
{{APP_SPEC}}

## Task

Analyze this specification and break it down into 5-20 independent features. Each feature should be:

1. **Self-contained**: Can be implemented and tested independently
2. **Valuable**: Delivers user-visible functionality
3. **Testable**: Has clear acceptance criteria
4. **Right-sized**: Implementable in one focused session (30-60 min)

## Output Format

Return a JSON array of features. Each feature must have:

```json
[
  {
    "id": "F-1",
    "name": "Short feature name",
    "description": "What this feature does and why it matters",
    "dependencies": [],
    "priority": 1,
    "reliability": 95,
    "externalDeps": []
  },
  {
    "id": "F-2",
    "name": "Another feature",
    "description": "Description here",
    "dependencies": ["F-1"],
    "priority": 2,
    "reliability": 90,
    "externalDeps": ["Tana API"]
  }
]
```

### Reliability Estimation

Estimate each feature's reliability (0-100%):
- **95%**: Pure internal logic, no external dependencies
- **90%**: Simple external dependency (file system, local DB)
- **85%**: Single external API
- **80%**: Multiple external APIs or complex integrations
- **75%**: Real-time external dependencies or fragile integrations

## Rules

1. **Priority ordering**: Features with no dependencies come first (lower priority number = implement first)
2. **Dependencies**: Only list direct dependencies, not transitive ones
3. **Foundation first**: Data models, schemas, and core utilities should be early features
4. **UI last**: User-facing features depend on backend functionality
5. **No over-splitting**: Don't create features that are just "add a field" or "write one function"

## Example Decomposition

For a "Task Management CLI":

```json
[
  {"id": "F-1", "name": "Core data model", "description": "Task and Tag SQLite schemas with CRUD operations", "dependencies": [], "priority": 1},
  {"id": "F-2", "name": "Add task command", "description": "CLI command to create tasks with title, description, due date", "dependencies": ["F-1"], "priority": 2},
  {"id": "F-3", "name": "List tasks command", "description": "Display tasks with filtering by status, tag, due date", "dependencies": ["F-1"], "priority": 2},
  {"id": "F-4", "name": "Complete task command", "description": "Mark tasks as done with completion timestamp", "dependencies": ["F-1"], "priority": 3},
  {"id": "F-5", "name": "Tag management", "description": "Create, list, delete tags and assign to tasks", "dependencies": ["F-1"], "priority": 3},
  {"id": "F-6", "name": "Due date reminders", "description": "List overdue and upcoming tasks", "dependencies": ["F-3"], "priority": 4}
]
```

## Chain Reliability Analysis

After decomposing, analyze the dependency chains:

```
Chain Reliability = Product of individual feature reliabilities

Example:
F-1 (95%) → F-2 (90%) → F-5 (85%) = 0.95 × 0.90 × 0.85 = 72.7%
```

**Risk Thresholds:**
- **>80%**: Low risk - proceed normally
- **60-80%**: Moderate risk ⚠️ - consider adding error boundaries
- **<60%**: High risk 🔴 - restructure to reduce chain depth or add circuit breakers

**Mitigation Strategies for High-Risk Chains:**
1. Add circuit breakers at chain depth > 3
2. Prefer fan-out (parallel features) over deep chains
3. Add explicit error boundaries at chain transitions
4. Consider caching/fallback for external dependencies

Include a `chainAnalysis` section in your output:

```json
{
  "chainAnalysis": {
    "maxDepth": 4,
    "riskiestChain": "F-1 → F-2 → F-5 → F-8",
    "compoundReliability": 68.5,
    "recommendation": "Add circuit breaker between F-5 and F-8"
  }
}
```

Now decompose the provided application specification:
