# Specify Phase with Interview

**Extends**: `sdd-workflow.md` Phase 1
**Integration**: Uses Interview skill for requirements elicitation

## Overview

The Specify phase now begins with a structured interview using the Interview skill before writing the specification. This ensures deep understanding of requirements before committing to a spec.

## Workflow

```
User Request
     |
     v
+----------------+
| INTERVIEW      | ← Uses AskUserQuestion tool
| (8 phases)     |   2-3 questions per phase
+----------------+
     |
     v
+----------------+
| SYNTHESIZE     | ← Convert answers to spec.md
| spec.md        |
+----------------+
     |
     v
+----------------+
| QUALITY GATE   | ← Run specflow eval (80% threshold)
| (spec-quality) |   Iterate until pass
+----------------+
     |
     v
+----------------+
| USER REVIEW    | ← User approves or requests changes
+----------------+
     |
     v
Proceed to specflow plan F-N
```

## Interview Protocol

When `specflow specify F-N` is invoked:

### Step 1: Acknowledge & Set Context

```
I'll help you specify <feature>. Before writing any specification,
I want to deeply understand your requirements through a series of questions.

This interview covers:
1. Problem & Pain - What we're really solving
2. Users & Context - Who benefits and how
3. Technical Context - What exists today
4. Constraints & Tradeoffs - What matters most
5. User Experience - How it should feel
6. Edge Cases - What could go wrong
7. Success Criteria - How we know it's done
8. Scope & Future - What's in and out

Let's begin.
```

### Step 2: Conduct Interview Rounds

Use AskUserQuestion for each round. Adapt questions based on:
- Feature type (UI vs backend vs CLI)
- User's previous answers
- Identified areas of uncertainty

**Example Round 1 (Problem Space):**

```typescript
AskUserQuestion({
  questions: [
    {
      header: "Core Problem",
      question: "What specific problem does this feature solve, and what do users do today without it?",
      multiSelect: false,
      options: [
        { label: "Manual workaround", description: "Users do this manually but it's painful/slow" },
        { label: "Currently impossible", description: "Users simply cannot do this today" },
        { label: "Scattered solutions", description: "Multiple tools/processes that should be unified" },
        { label: "Quality issues", description: "Current approach leads to errors or inconsistency" }
      ]
    },
    {
      header: "Urgency Driver",
      question: "Why is solving this problem important NOW rather than later?",
      multiSelect: false,
      options: [
        { label: "External deadline", description: "Regulation, contract, or market timing" },
        { label: "Growing pain", description: "Problem is getting worse as usage increases" },
        { label: "Blocking other work", description: "Can't proceed with other priorities until this is done" },
        { label: "User demand", description: "Users are explicitly requesting this" }
      ]
    }
  ]
})
```

### Step 3: Follow-Up on Ambiguity

When answers reveal complexity, dig deeper:

```typescript
// If user selected "Mixed audience" for users
AskUserQuestion({
  questions: [
    {
      header: "User Segments",
      question: "You mentioned mixed audiences. Which segment is the PRIMARY user we should optimize for?",
      multiSelect: false,
      options: [
        { label: "Technical/developers", description: "Optimize for power and flexibility" },
        { label: "Business users", description: "Optimize for simplicity and guidance" },
        { label: "Admins/ops", description: "Optimize for automation and monitoring" }
      ]
    }
  ]
})
```

### Step 4: Synthesize into Specification

After all rounds complete, generate `spec.md`:

```markdown
# Specification: <Feature Name>

## Context
> Generated from Interview conducted on <date>

## Problem Statement

**Core Problem**: <From Round 1>
**Urgency**: <From Round 1>
**Impact if Unsolved**: <Derived from answers>

## Users & Stakeholders

**Primary User**: <From Round 2>
- Technical Level: <selected option>
- Usage Context: <selected option>

**Secondary Stakeholders**: <if identified>

## Current State

**Existing Systems**: <From Round 3>
**Integration Points**: <From Round 3>
**Previous Attempts**: <if discussed>

## Requirements

### Functional Requirements

| ID | Requirement | Source |
|----|-------------|--------|
| FR-1 | <derived from interview> | Round X |
| FR-2 | ... | ... |

### Non-Functional Requirements

| ID | Requirement | Source |
|----|-------------|--------|
| NFR-1 | Performance: <from Round 4> | Round 4 |
| NFR-2 | Security: <if discussed> | Round 4 |

## User Experience

**Discovery**: How users find this feature
**Happy Path**: Primary workflow
**Error Handling**: <From Round 5>
**Recovery Options**: <From Round 5>

## Edge Cases & Failure Modes

| Scenario | Expected Behavior | Source |
|----------|-------------------|--------|
| <from Round 6> | <selected approach> | Round 6 |

## Success Criteria

**Definition of Done**: <From Round 7>
**Success Metrics**: <From Round 7>
**Minimum Viable Version**: <From Round 8>

## Scope

### In Scope
- <derived from interview>

### Explicitly Out of Scope
- <From Round 8 "Explicitly Out" question>

## Open Questions

- [ ] <Any unresolved items from interview>

## Assumptions

- <Assumptions made during interview>

---
*Interview conducted: <timestamp>*
*Phases completed: 8/8*
```

### Step 5: Quality Gate (Eval)

Before presenting to the user, run the spec quality evaluation:

```bash
# Run eval on the generated spec
specflow eval run --file .specify/specs/F-N-<feature>/spec.md --suite spec-quality
```

**If score ≥ 80% (pass threshold)**: Proceed to user review.

**If score < 80%**: The spec has quality issues that should be fixed before review.

```
⚠️ Spec Quality Check: 71% (below 80% threshold)

Issues to address:
- **Acceptance Criteria** (70%): Missing Given/When/Then scenarios
- **Error Handling** (30%): No failure scenarios defined

Revising spec to address these gaps...
```

Iterate on the spec until it passes, then proceed to user review.

### Step 6: Present for Review

```
I've synthesized your answers into a specification. Please review:

<show spec.md summary>

Key decisions captured:
- Primary user: <X>
- Performance requirement: <Y>
- MVP scope: <Z>

Do you want to:
1. Approve and proceed to specflow plan F-N
2. Clarify or modify any section
3. Add additional requirements
```

## Adaptive Behavior

### Skip Irrelevant Questions

- **CLI tool**: Skip mobile/responsive questions
- **Internal tool**: Skip public user questions
- **Read-only feature**: Skip data modification questions

### Deepen on Red Flags

If user selects:
- "Security breach" as failure mode → Ask about auth, data sensitivity
- "Data loss" as failure mode → Ask about backup, undo, confirmation
- "Real-time performance" → Ask about latency requirements, caching

### Challenge Surface Answers

When answer seems too easy:
- "What would make this more complex than it appears?"
- "What assumptions are we making that might be wrong?"
- "What has made similar projects fail in the past?"

## Example Session

```
User: specflow specify F-1  (feature: add a delete button to user profiles)

Claude: Before writing a spec, let me understand your requirements.

[Round 1]
Claude asks: What specific problem does "delete user profile" solve?
User selects: "Manual workaround" + explains: "Admins delete via database"

Claude asks: Why is this important now?
User selects: "User demand" + explains: "GDPR requests increasing"

[Round 2]
Claude asks: Who will use delete functionality?
User selects: "Mixed audience"

Claude follows up: Which is the PRIMARY user?
User selects: "Admins/ops" + explains: "Users request, admins execute"

... continues through all relevant rounds ...

[Synthesis]
Claude: Based on our interview, this is actually a GDPR compliance feature,
not just a UI button. The spec should include:
- Admin-only deletion workflow
- Audit logging for compliance
- Confirmation with data preview
- Related data cascade decisions

<presents spec.md for review>
```

## Integration Points

- **Interview Skill**: Provides question framework and AskUserQuestion patterns
- **SpecFlow Templates**: Uses `templates/spec.md` as base structure
- **Features Database**: Records feature in `.specflow/features.db`
