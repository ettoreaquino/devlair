---
name: review-pr
description: Comprehensive code review and README review for a PR — posts structured comments with findings
user_invocable: true
---

# PR Review

Perform a comprehensive code review and README review for a pull request, then post structured findings as PR comments.

## Arguments

Parse `<args>` for:
- A PR number (e.g. `#51` or `51`) — review this PR.
- If no PR number is given, detect the PR for the current branch: `gh pr view --json number`.

## Step 1: Gather PR context

Run in parallel:

```bash
gh pr view <N> --json number,title,body,files,additions,deletions
gh pr diff <N>
```

## Step 2: Code Review

Launch three review agents in parallel, passing the full diff to each:

### Agent 1: Code Reuse
- Search for existing utilities and helpers that could replace newly written code
- Flag new functions that duplicate existing functionality
- Flag inline logic that could use an existing utility (string manipulation, path handling, type guards)

### Agent 2: Code Quality
- Redundant state or derived values that duplicate existing state
- Copy-paste with slight variation that should be unified
- Leaky abstractions or broken abstraction boundaries
- Stringly-typed code where constants/types exist
- Unnecessary JSX/HTML nesting with no layout purpose
- Unnecessary comments explaining WHAT instead of WHY

### Agent 3: Efficiency
- Unnecessary work: redundant computations, repeated reads, N+1 patterns
- Missed concurrency: independent operations that could run in parallel
- Hot-path bloat: blocking work on startup or per-request paths
- Memory: unbounded structures, missing cleanup, listener leaks
- Overly broad operations: reading entire files when portions suffice

## Step 3: README Review

Read `README.md` and check against the PR diff:

### Structure (compare against uv, Starship, ripgrep, fzf, Zoxide)
1. One-line description immediately after logo
2. Badges: 4-6 max, ordered Release > CI > Platform > License, flat-square style, all linked
3. Visual demo above the fold
4. Feature highlights: 4-8 scannable bullets
5. Installation front and center with platform-specific blocks
6. Usage examples with real console input+output
7. Collapsible `<details>` for optional features
8. Development/Contributing section
9. License at bottom

### Content accuracy
- Project structure matches actual directory layout
- All example commands actually work
- Version references not hardcoded to stale values
- Install instructions match current release mechanism
- Module/feature descriptions match current code
- No removed features still documented, no new features undocumented

### Quality signals
- GitHub admonitions for prerequisites, caveats, alpha status
- Dark/light mode responsive images via `<picture>` tags
- No badge walls, no stale CI links
- Table of Contents if README exceeds 4 screenfuls

## Step 4: Fix issues

Fix any drift or inaccuracies found in the README directly (commit + push to the PR branch).
For code issues, fix if straightforward. If a finding is a false positive, skip it.

## Step 5: Post PR comments

Post two separate structured comments to the PR using `gh pr comment <N>`:

### Comment 1: Code Review
```markdown
## Code Review -- PR #<N>

### Code Reuse
<findings or "No issues found.">

### Code Quality
<findings or "No issues found.">

### Efficiency
<findings or "No issues found.">

### Verdict: **<Ship it / Needs changes>** <check or x emoji>

Generated with [Claude Code](https://claude.com/claude-code)
```

### Comment 2: README Review
```markdown
## README Review -- PR #<N>

### Structure
<findings>

### Content accuracy
<findings>

### Quality signals
<findings>

### Verdict: **<Current / N fixes applied>**

Generated with [Claude Code](https://claude.com/claude-code)
```
