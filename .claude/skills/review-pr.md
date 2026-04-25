---
name: review-pr
description: Comprehensive code, security, and README review for a PR — posts structured comments with findings
user_invocable: true
---

# PR Review

Perform a comprehensive code review, security review, and README review for a pull request, then post structured findings as PR comments.

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

Launch four review agents in parallel, passing the full diff to each:

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

### Agent 4: Security
Audit the diff for vulnerabilities across these categories:

**Injection & execution**
- Command injection: unquoted variables in shell commands, `eval`, backticks, string interpolation into `bash -c`, `subprocess.run(shell=True)`
- SQL/NoSQL injection: user input in query strings
- Path traversal: user-controlled file paths without canonicalization
- Template injection: user input in format strings, heredocs, sed expressions

**Secrets & credentials**
- Hardcoded secrets, API keys, tokens, passwords in source code
- Secrets logged, printed, or emitted in JSON events
- `.env` files committed, world-readable, or missing from `.gitignore`
- Secrets passed via command-line arguments (visible in `ps`)
- Missing or weak secret generation (predictable, short, low entropy)

**Privilege & access control**
- Unnecessary root execution or missing privilege drops
- Overly permissive file permissions (world-readable keys, 0644 on secrets)
- `sudo` usage without proper input validation
- Missing authentication or authorization checks
- Allowlists that can be bypassed or are empty by default

**Supply chain & integrity**
- Download-then-execute without checksum or signature verification
- Unpinned dependencies (`:latest` images, `HEAD` branches, `>=` versions)
- Piping curl to shell (`curl | bash`)
- Missing GPG/SHA verification where the project convention requires it

**Network & exposure**
- Services binding to `0.0.0.0` when they should bind to `127.0.0.1` or Tailscale
- Ports exposed without firewall rules or access control
- Missing TLS/encryption for sensitive data in transit
- Webhook endpoints without authentication or HMAC validation

**Container & runtime security**
- Containers running as root
- Docker socket mounted into containers
- Missing `cap_drop: ALL`, `read_only: true`, `no-new-privileges`
- Excessive resource limits or no limits set
- Sensitive bind mounts or volume permissions

**Data handling**
- Sensitive data in logs (API keys, tokens, PII in error messages)
- Missing rate limiting on endpoints processing external input
- Unbounded input parsing (DoS via large payloads)
- TOCTOU races in file operations (check-then-write without locks)

For each finding report: file, line range, category, description, severity (critical/high/medium/low), and suggested fix.

## Step 3: Test Plan Verification

Parse the PR body for a `## Test plan` section. If it contains a checklist (`- [ ]` items), verify each item:

### Verification strategy

For each test plan item, determine the verification method:

1. **Automated checks** — items like "tests pass", "lint passes", "typecheck passes":
   - Run the actual commands (`bun test`, `bun run lint`, `bun run typecheck`, `pytest`, etc.)
   - Check the box if the command succeeds

2. **Code-verifiable checks** — items describing behavior ("X launches wizard", "Y shows table", "Z cannot be deselected"):
   - Read the relevant source files
   - Trace the code path to confirm the behavior is implemented
   - Check the box if the code confirms the behavior
   - If the code does NOT confirm it, leave unchecked and note what's wrong

3. **Manual-only checks** — items requiring visual inspection or real environment ("renders correctly", "works on WSL"):
   - Leave unchecked
   - Add a note: `<!-- needs-manual: brief reason -->`

### Actions

1. Run all automated checks first (tests, lint, typecheck) in parallel
2. For each code-verifiable item, read the relevant files and trace the logic
3. Update the PR description with checked/unchecked boxes:
   ```bash
   gh pr edit <N> --body "<updated body with checked boxes>"
   ```
4. If any item fails verification, do NOT check it — add a comment explaining why

### Important

- Never check a box you cannot verify
- Always run actual test commands rather than assuming they pass
- For code-verifiable items, cite the specific file:line that confirms the behavior
- Group manual-only items together in the test plan comment (Step 6)

## Step 4: README Review

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

## Step 5: Fix issues

Fix any drift or inaccuracies found in the README directly (commit + push to the PR branch).
For code issues, fix if straightforward. If a finding is a false positive, skip it.

## Step 6: Post PR comments

Post three separate structured comments to the PR using `gh pr comment <N>`:

### Comment 1: Code Review
```markdown
## Code Review -- PR #<N>

### Code Reuse
<findings or "No issues found.">

### Code Quality
<findings or "No issues found.">

### Efficiency
<findings or "No issues found.">

### Security
<findings table with columns: #, Category, Finding, File, Severity, Status>
<or "No issues found.">

### Verdict: **<Ship it / Needs changes>** <check or x emoji>

Generated with [Claude Code](https://claude.com/claude-code)
```

### Comment 2: Test Plan Verification
```markdown
## Test Plan Verification -- PR #<N>

| # | Item | Method | Result | Notes |
|---|------|--------|--------|-------|
| 1 | <item text> | <automated/code-verified/manual> | <pass/fail/needs-manual> | <brief note or file:line cite> |
| ... | ... | ... | ... | ... |

### Summary
- **Automated:** N/N passed
- **Code-verified:** N/N confirmed
- **Needs manual testing:** N items

<If any items failed, explain what went wrong and what needs to be fixed.>

Generated with [Claude Code](https://claude.com/claude-code)
```

### Comment 3: README Review
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
