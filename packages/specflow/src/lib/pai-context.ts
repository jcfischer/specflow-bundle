/**
 * PAI Context for Subagents
 * Provides essential PAI infrastructure context for Task tool subagents
 */

/**
 * Get PAI context to include in subagent prompts
 */
export function getPAIContext(): string {
  return `## PAI Infrastructure Context

You are operating within Jens-Christian's Personal AI Infrastructure (PAI).

### Stack Preferences

| Prefer | Avoid |
|--------|-------|
| TypeScript | Python |
| Bun | npm/yarn/pnpm |
| Markdown | HTML for docs |
| CLI tools | GUI-only |
| Code | Complex prompts |

### Development Conventions

1. **Code before prompts** - If code can solve it, use code
2. **Spec/test first** - Define expected behavior before building
3. **CLI for reusable tools** - Always add \`--help\`, JSON output, exit codes
4. **Avoid over-engineering** - Only make changes directly requested
5. **Keep it simple** - Don't add features, refactor, or "improve" beyond what's asked

### Key Rules

- NEVER create documentation files unless explicitly requested
- NEVER add comments/docstrings to code you didn't change
- Prefer editing existing files over creating new ones
- Use Bun for running TypeScript and tests
- Projects live in \`~/work/\`

### Available Skills (reference only)

- **SpecFlow**: Spec-driven development workflow
- **SpecFlow**: Multi-feature orchestration (you're part of this)
- **Interview**: Requirements elicitation
- **Browser**: Playwright automation
- **Tana**: Knowledge management integration
- **Email**: Email operations

### Verification

Always verify your work:
- Run tests if they exist (\`bun test\`)
- Run typecheck for TypeScript (\`bun run typecheck\` or \`tsc --noEmit\`)
- Test the feature manually if applicable`;
}

/**
 * Get minimal PAI context (for smaller prompts)
 */
export function getMinimalPAIContext(): string {
  return `## Development Context

- **Stack**: TypeScript + Bun (not npm/yarn)
- **Location**: Projects in \`~/work/\`
- **Style**: Simple, no over-engineering, edit existing files
- **Verify**: Run \`bun test\` and \`bun run typecheck\` when done`;
}
