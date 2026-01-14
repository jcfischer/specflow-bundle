---
id: "[SPEC_ID]"
feature: "[FEATURE_NAME]"
status: "draft"
created: "[DATE]"
---

# Specification: [FEATURE_NAME]

## Overview

[High-level summary of what this feature does and why it matters]

## User Scenarios

### Scenario 1: [Primary Use Case]

**As a** [user type]
**I want to** [action]
**So that** [benefit]

**Acceptance Criteria:**
- [ ] [Testable criterion 1]
- [ ] [Testable criterion 2]

### Scenario 2: [Secondary Use Case]

**As a** [user type]
**I want to** [action]
**So that** [benefit]

**Acceptance Criteria:**
- [ ] [Testable criterion 1]
- [ ] [Testable criterion 2]

## Functional Requirements

### FR-1: [Requirement Name]

[Description of what the system must do]

**Validation:** [How to verify this works]

### FR-2: [Requirement Name]

[Description of what the system must do]

**Validation:** [How to verify this works]

## Non-Functional Requirements

- **Performance:** [Response time, throughput expectations]
- **Security:** [Authentication, authorization needs]
- **Scalability:** [Expected load, growth patterns]
- **Failure Behavior:**
  - On database unavailable: [How system responds]
  - On external API timeout: [Fallback strategy]
  - On malformed input: [Validation response]
  - On unknown error: [Logging, recovery, user feedback]

## Key Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| [Name] | [What it is] | [Important fields] |

## Success Criteria

- [ ] [Measurable outcome 1]
- [ ] [Measurable outcome 2]
- [ ] [Measurable outcome 3]

## Assumptions

| Assumption | What Would Invalidate It | Detection Strategy |
|-----------|-------------------------|-------------------|
| [Assumption 1] | [Condition that breaks it] | [How we'd know] |
| [Assumption 2] | [Condition that breaks it] | [How we'd know] |

## System Context

### Upstream Dependencies

| System | What We Get | What Breaks If It Changes | Version/Contract |
|--------|-------------|---------------------------|------------------|
| [System 1] | [Data/capability] | [Impact] | [Version] |

### Downstream Consumers

| System | What They Expect | Breaking Change Threshold |
|--------|-----------------|--------------------------|
| [Consumer 1] | [Expected interface] | [What would break them] |

### Adjacent Systems (Implicit Coupling)

| System | Implicit Dependency | Risk |
|--------|---------------------|------|
| [System 1] | [Shared resource/format] | [Risk level] |

## [NEEDS CLARIFICATION]

- [Ambiguous area 1]
- [Ambiguous area 2]

## Out of Scope

- [Explicitly excluded item 1]
- [Explicitly excluded item 2]
