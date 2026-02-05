/**
 * Headless Module Tests
 *
 * Tests for extractMarkdownArtifact which extracts spec/plan content
 * from Claude's headless (-p mode) text output.
 *
 * In headless mode, Claude cannot write files — it returns text only.
 * The extraction function recovers the markdown artifact from the output
 * so specflow can write it to disk.
 */

import { describe, it, expect } from "bun:test";
import { extractMarkdownArtifact } from "../../src/lib/headless";

describe("extractMarkdownArtifact", () => {
  it("should return null for empty output", () => {
    expect(extractMarkdownArtifact("")).toBeNull();
    expect(extractMarkdownArtifact("  \n  ")).toBeNull();
  });

  it("should extract from fenced markdown block", () => {
    const output = `Here is the specification:

\`\`\`markdown
# Specification: My Feature

## Overview
This feature does something useful.

## Functional Requirements
| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Must do X | High |
\`\`\`

[PHASE COMPLETE: SPECIFY]
Feature: F-019
Spec: /path/to/spec.md
Mode: batch (non-interactive)`;

    const result = extractMarkdownArtifact(output);

    expect(result).not.toBeNull();
    expect(result).toContain("# Specification: My Feature");
    expect(result).toContain("## Functional Requirements");
    expect(result).not.toContain("[PHASE COMPLETE");
  });

  it("should extract from fenced md block", () => {
    const output = `\`\`\`md
# Specification: Test

## Overview
Short spec.
\`\`\``;

    const result = extractMarkdownArtifact(output);

    expect(result).not.toBeNull();
    expect(result).toContain("# Specification: Test");
  });

  it("should extract from markdown heading when no fence", () => {
    const output = `# Specification: GitHub Issue Router

## Overview
Routes GitHub issues through the specflow pipeline.

## User Scenarios

### Scenario 1: New Issue
- **Given** a new issue is created
- **When** the dispatch agent processes it
- **Then** a spec is generated

## Functional Requirements
| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Route issues | High |

[PHASE COMPLETE: SPECIFY]
Feature: F-019
Spec: /path/to/spec.md`;

    const result = extractMarkdownArtifact(output);

    expect(result).not.toBeNull();
    expect(result).toContain("# Specification: GitHub Issue Router");
    expect(result).toContain("## User Scenarios");
    expect(result).toContain("FR-1");
    expect(result).not.toContain("[PHASE COMPLETE");
  });

  it("should handle output with only phase markers and short content", () => {
    const output = `[PHASE COMPLETE: SPECIFY]
Feature: F-019
Spec: /path/spec.md
Mode: batch`;

    const result = extractMarkdownArtifact(output);

    // Too short after stripping markers
    expect(result).toBeNull();
  });

  it("should extract content when preceded by preamble text", () => {
    const output = `I'll create the specification based on the decomposition data provided.

# Specification: Auto-Scaling Worker Pool

## Overview
Automatically scales worker pool based on queue depth.

## Functional Requirements
| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Monitor queue depth | High |
| FR-2 | Scale workers up when threshold exceeded | High |

## Success Criteria
- [ ] Workers scale within 30 seconds
- [ ] No tasks dropped during scaling

[PHASE COMPLETE: SPECIFY]`;

    const result = extractMarkdownArtifact(output);

    expect(result).not.toBeNull();
    expect(result).toContain("# Specification: Auto-Scaling Worker Pool");
    expect(result).toContain("FR-2");
    expect(result).toContain("Success Criteria");
  });

  it("should prefer fenced block over heading extraction", () => {
    const output = `Some preamble text.

# This is not the spec

\`\`\`markdown
# Specification: Real Spec

## Overview
The actual spec content.
\`\`\`

[PHASE COMPLETE: SPECIFY]`;

    const result = extractMarkdownArtifact(output);

    expect(result).not.toBeNull();
    expect(result).toContain("# Specification: Real Spec");
    expect(result).not.toContain("This is not the spec");
  });

  it("should handle output with PHASE BLOCKED marker", () => {
    const output = `# Specification: Blocked Feature

## Overview
This feature is blocked.

[PHASE BLOCKED: SPECIFY]
Feature: F-020
Reason: Missing external API documentation`;

    const result = extractMarkdownArtifact(output);

    expect(result).not.toBeNull();
    expect(result).toContain("# Specification: Blocked Feature");
    expect(result).not.toContain("[PHASE BLOCKED");
  });

  it("should use full output as fallback for long content without headings", () => {
    const longContent = "This is a detailed specification without markdown headings. ".repeat(5);
    const output = `${longContent}

[PHASE COMPLETE: SPECIFY]
Feature: F-019`;

    const result = extractMarkdownArtifact(output);

    expect(result).not.toBeNull();
    expect(result).toContain("detailed specification");
    expect(result).not.toContain("[PHASE COMPLETE");
  });

  it("should handle null-like inputs gracefully", () => {
    expect(extractMarkdownArtifact("")).toBeNull();
    // @ts-expect-error testing runtime behavior
    expect(extractMarkdownArtifact(null)).toBeNull();
    // @ts-expect-error testing runtime behavior
    expect(extractMarkdownArtifact(undefined)).toBeNull();
  });
});
