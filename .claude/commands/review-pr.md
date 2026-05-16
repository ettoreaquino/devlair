---
description: Orchestrates a multi-subagent PR review (four parallel code reviewers, then fix-applier, then README updater) and posts a single structured comment crediting each reviewer.
allowed-tools: Bash, Read, Write, Edit, Grep, Glob
---

# PR Review

Fan out the PR review across four custom code-review subagents, run gates inline, hand the findings to `pr-fix-applier` (auto-applies the unambiguous ones, commits, pushes), then run `pr-readme-updater` to sync the README against the final tree, then post a single comment crediting each contributor. The hard rule from `CLAUDE.md` applies: never approve, only comment.

## Arguments

Parse the slash-command arguments for a PR number (e.g. `/review-pr 66` or `/review-pr #66`). If none given, detect the PR for the current branch via `gh pr view --json number`.

## Step 1: Gather PR context

Run in parallel in the main session — these results are then handed to the subagents:

```bash
gh pr view <N> --json number,title,body,files,additions,deletions
gh pr diff <N>
```

## Step 2: Fan out reviewers (single message, four Agent tool uses)

Spawn all four subagents in **one message** so they run in parallel. Each gets the diff, the PR title/number, the file list, and an explicit "JSON only" reminder. The agents are defined in `.claude/agents/`:

| subagent_type | Focus |
|---|---|
| `pr-reuse-reviewer` | Code that duplicates existing utilities |
| `pr-quality-reviewer` | Redundant state, leaky abstractions, useless comments |
| `pr-efficiency-reviewer` | Wasted work, missed concurrency, hot-path bloat |
| `pr-security-reviewer` | Injection, secrets, privilege, supply-chain, network, container, data |

Each subagent returns a compact JSON object: `{"findings": [...], "verdict": "ship"|"changes"}`. Collect all four into a single `reviewers` object keyed by reviewer name — you will pass this verbatim to `pr-fix-applier` in Step 4 and render it into the comment in Step 6.

If a subagent's tool result is not valid JSON, do **not** treat it as a clean bill of health. Insert a synthetic finding (`severity: "medium"`, `category: "review-error"`, `description: "Reviewer returned malformed output — manual review required"`) and force the verdict to `changes` for that reviewer. The security reviewer's silence must never be misread as approval.

## Step 3: Test plan verification (inline, main session)

Subagents do not have access to the working tree's running tests, so this step stays in the main session.

Parse the PR body for a `## Test plan` checklist. For each `- [ ]` item:

1. **Automated** items ("tests pass", "lint passes", "typecheck passes") — run the actual command (`bun test`, `bun run lint`, `bun run typecheck`, `uv run pytest tests/unit/`, `uv run ruff check`). Run independent commands in parallel. Check the box only if the command exits 0.
2. **Code-verifiable** items (behavior claims) — read the relevant files, trace the code path, cite `file:line`. Check only if the code confirms the behavior.
3. **Manual-only** items (visual or environment-specific) — leave unchecked, append `<!-- needs-manual: brief reason -->`.

Update the PR body via `gh pr edit <N> --body-file <tmpfile>` (write the new body via `Write` first, then pass the file). **Never** interpolate the body into a shell-quoted argument.

## Step 4: Apply code fixes (`pr-fix-applier`)

Invoke `pr-fix-applier` as a single Agent call. Pass:

- The PR number and current head SHA.
- The `reviewers` object collected in Step 2.
- The file list from `gh pr view --json files`.

`pr-fix-applier` returns JSON with `applied`, `declined`, `failed`, `gates`, and `pushed`. Keep this object — Step 6 renders it into the comment.

If `pushed: false`, surface why (gate failures or no findings worth applying) in Step 6 but still post the comment. Do not retry; the human decides whether to push manually.

## Step 5: Update the README (`pr-readme-updater`)

Skip this step only when `pr-fix-applier` returned `pushed: false` **and** its `failed` list is non-empty — i.e. gates failed and the tree is in an indeterminate state. In every other case (clean tree with no fixes needed, or successful fix push), run the updater.

Invoke `pr-readme-updater` as a single Agent call. Pass:

- The PR number, branch name, and head SHA (after Step 4's push, if any).
- The PR's file list from Step 1 (the updater uses this to decide v1-vs-v2 scope deterministically — never by scanning the diff text).
- The branch diff: re-fetch via `gh pr diff <N>` **only when** `pr-fix-applier` pushed new commits in Step 4. Otherwise reuse the diff captured in Step 1 — the tree has not changed.

`pr-readme-updater` returns JSON with `committed`, `changes`, and `noted_code_drift`. Before rendering Step 6, drop any `noted_code_drift` item whose `file` already appears in `pr-fix-applier.applied` — those drifts have been resolved and would mislead the reader.

## Step 6: Post one comment

Render the comment body to a temp file via `Write`, then post with `gh pr comment <N> --body-file <path>`. **Never** use `gh pr comment <N> --body "..."` — finding text comes from the PR diff (attacker-controlled) and may contain shell metacharacters.

Comment body shape:

```markdown
## Review · PR #<N>

### Code Review

#### Reuse
<bullets, or "No issues found.">

#### Quality
<bullets, or "No issues found.">

#### Efficiency
<bullets, or "No issues found.">

#### Security
| # | Category | Finding | File | Severity |
|---|----------|---------|------|----------|
<one row per finding>

(Auto-fix disposition for every reviewer is rendered once in the **Auto-applied fixes** subsection below — do not duplicate it here.)

**Verdict:** <Ship it ✅ / Needs changes ❌>

### Auto-applied fixes (`pr-fix-applier`)

<For each entry in `applied`, render:>
- **<reviewer>** · `<file>:<line>` (<severity>) — <summary>

<If `failed` is non-empty, render under a "Failed gates" subheader.>
<If `declined` is non-empty, render under a "Declined (advisory)" subheader.>

Commit: `<head_sha>` · Gates: typecheck ✓ · lint ✓ · <N> tests · Pushed: <yes/no>

### README sync (`pr-readme-updater`)

<If `committed: true`, render each entry in `changes` as a bullet. End with "Commit: <head_sha>".>
<If `committed: false`, render "No README drift — docs already match.">
<If `noted_code_drift` is non-empty, render under a "Possible drift the README didn't fix" subheader.>

### Test plan

| # | Item | Method | Result |
|---|------|--------|--------|
<one row per checklist item, from Step 3>

**Automated:** N/N · **Code-verified:** N/N · **Needs manual:** N

Generated with [Claude Code](https://claude.com/claude-code)
```

Verdict: `Ship it ✅` if every code reviewer returned `ship` **and** `pr-fix-applier.failed` is empty. Otherwise `Needs changes ❌`.

## Hard constraints

- **Never `gh pr review --approve`.** Use `gh pr comment` only. (See CLAUDE.md "Hard rules".)
- **Never force-push to main.** Sub-agents have the same rule on the PR branch.
- **Never spawn the four reviewers sequentially.** They must be in a single tool-use block so they run in parallel.
- **Never invoke `pr-fix-applier` and `pr-readme-updater` in parallel.** README sync must see the post-fix tree, so they are strictly sequential (Step 4 then Step 5).
- **Never interpolate subagent output into a shell-quoted argument.** Always `Write` to a tempfile and pass via `--body-file` (or `-F`).
- **Never auto-apply patches from `pr-readme-updater` against files other than `README.md`**, and never run code gates inside the README updater — that is what `pr-fix-applier` already validated.
