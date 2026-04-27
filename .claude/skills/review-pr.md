---
name: review-pr
description: Orchestrates a multi-subagent PR review (reuse, quality, efficiency, security, README) plus test-plan verification, then posts three structured comments
user_invocable: true
---

# PR Review

Fan out the PR review across five custom subagents in `.claude/agents/`, run test-plan verification inline, and post three structured comments. The hard rule from `CLAUDE.md` applies: never approve, only comment.

## Arguments

Parse `<args>` for a PR number (e.g. `#66` or `66`). If none given, detect via `gh pr view --json number`.

## Step 1: Gather PR context

Run in parallel in the main session — these results are then handed to the subagents:

```bash
gh pr view <N> --json number,title,body,files,additions,deletions
gh pr diff <N>
```

## Step 2: Fan out reviewers (single message, five Agent tool uses)

Spawn all five subagents in **one message** so they run in parallel. Each gets the diff, the PR title/number, and an explicit "JSON only" reminder. The agents are defined in `.claude/agents/`:

| subagent_type | Focus |
|---|---|
| `pr-reuse-reviewer` | Code that duplicates existing utilities |
| `pr-quality-reviewer` | Redundant state, leaky abstractions, useless comments |
| `pr-efficiency-reviewer` | Wasted work, missed concurrency, hot-path bloat |
| `pr-security-reviewer` | Injection, secrets, privilege, supply-chain, network, container, data |
| `pr-readme-reviewer` | README drift vs. PR diff (returns suggested patches) |

Each subagent returns a compact JSON object: `{"findings": [...], "verdict": "ship"|"changes"}`. Read the `description` and `category` fields to render the human-facing comment in Step 5.

If a subagent's tool result is not valid JSON, log the issue and treat it as `{"findings": [], "verdict": "ship"}` — do not retry the subagent.

## Step 3: Test plan verification (inline, main session)

Subagents do not have access to the working tree's running tests, so this step stays in the main session.

Parse the PR body for a `## Test plan` checklist. For each `- [ ]` item:

1. **Automated** items ("tests pass", "lint passes", "typecheck passes") — run the actual command (`bun test`, `bun run lint`, `bun run typecheck`, `uv run pytest tests/unit/`, `uv run ruff check`). Run independent commands in parallel. Check the box only if the command exits 0.
2. **Code-verifiable** items (behavior claims) — read the relevant files, trace the code path, cite `file:line`. Check only if the code confirms the behavior.
3. **Manual-only** items (visual or environment-specific) — leave unchecked, append `<!-- needs-manual: brief reason -->`.

Update the PR body via `gh pr edit <N> --body "..."` with the verified checkboxes.

## Step 4: Apply README fixes if proposed

If `pr-readme-reviewer` returned any findings with a `patch` field, apply each via `Edit` to `README.md`, then `git add README.md && git commit -m "docs(readme): address review drift" && git push`. Skip patches that fail to apply cleanly (e.g. non-unique `old_string`); surface them in the README comment instead.

For findings from the four code reviewers, fix only when the change is straightforward and clearly correct. Otherwise leave them as comment items for the human reviewer.

## Step 5: Post three PR comments

Use `gh pr comment <N>` once per template. Render each subagent's findings into the table cells.

### Comment 1 — Code Review

```markdown
## Code Review -- PR #<N>

### Code Reuse
<findings rendered as bullets, or "No issues found.">

### Code Quality
<findings rendered as bullets, or "No issues found.">

### Efficiency
<findings rendered as bullets, or "No issues found.">

### Security
| # | Category | Finding | File | Severity | Status |
|---|----------|---------|------|----------|--------|
<one row per finding, or single "No issues found." row>

### Verdict: **<Ship it ✅ / Needs changes ❌>**

Generated with [Claude Code](https://claude.com/claude-code)
```

Verdict: `Ship it` if every code reviewer (reuse, quality, efficiency, security) returned `ship`. Otherwise `Needs changes`.

### Comment 2 — Test Plan Verification

```markdown
## Test Plan Verification -- PR #<N>

| # | Item | Method | Result | Notes |
|---|------|--------|--------|-------|
<one row per checklist item>

### Summary
- **Automated:** N/N passed
- **Code-verified:** N/N confirmed
- **Needs manual testing:** N items

<failure summary if any>

Generated with [Claude Code](https://claude.com/claude-code)
```

### Comment 3 — README Review

```markdown
## README Review -- PR #<N>

### Structure
<findings or "No issues found.">

### Content accuracy
<findings or "No issues found.">

### Quality signals
<findings or "No issues found.">

### Verdict: **<Current / N fixes applied>**

Generated with [Claude Code](https://claude.com/claude-code)
```

## Hard constraints

- **Never `gh pr review --approve`.** Use `gh pr comment` only. (See CLAUDE.md "Hard rules".)
- **Never force-push to main.** README fixes go to the PR branch.
- **Never spawn the five reviewers sequentially.** They must be in a single tool-use block so they run in parallel; this is the whole point of fanning out to subagents.
