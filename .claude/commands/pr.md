---
description: Create a PR following the project SDLC — ensures issue exists, links PR, assigns, and adds to project board.
allowed-tools: Bash, Read, Grep, Glob
---

## Instructions

You are creating a pull request that follows the devlair SDLC practices. Every PR must have a linked issue, be assigned, and be tracked on the project board.

**Assignment rule:** the linked issue AND the PR must be assigned to the developer running this command. Always pass `--assignee @me` (gh resolves it to the authenticated user) — never hardcode a username. This applies whether the issue is newly created or already existed.

**Idempotency rule:** every board write in this skill is *set-to-desired-state*. `gh project item-add` is a no-op when the item is already on the board (returns the existing item ID), and `item-edit` writes the target status regardless of prior value. Re-running any step is safe.

**Pagination rule:** every `gh project item-list` call must pass `--limit 500`. The default 100-item page can silently miss recently-added items, which manifests as an empty `ITEM_ID` and a `Could not resolve to a node with the global id of ''` error from `item-edit`.

### Argument parsing

Parse `$ARGUMENTS` for:
- An issue number (e.g. `#20` or `20`) — link the PR to this existing issue.
- `--title "..."` — override the PR title.
- If no issue number is given, you will create one.

### Step 1: Gather state

Run these in parallel:

1. `git status` and `git diff --stat` — see what's staged/unstaged.
2. `git log main..HEAD --oneline` — commits on this branch.
3. `git diff main...HEAD --stat` — full diff summary vs main.
4. `git rev-parse --abbrev-ref HEAD` — current branch name.
5. `gh issue list --state open --assignee ettoreaquino --json number,title` — open issues.

### Step 2: Ensure an issue exists, on the board, and In Progress

**Both branches (new issue and existing issue) end with the same three operations: assignee attached, item on the board, status In Progress.** That symmetry is what prevents the "existing issue silently skips the board" drift.

If an issue number was provided in `$ARGUMENTS`:
1. Verify it exists: `gh issue view <number> --json number,assignees`.
2. If it doesn't exist, stop and report the error.
3. If the current user is not already among `assignees`, attach them: `gh issue edit <number> --add-assignee @me`. Never remove existing assignees.

If no issue number was provided:
1. Analyze the commits and diff to understand the scope of work.
2. Draft an issue title and body describing the work.
3. Create it: `gh issue create --title "..." --body "..." --assignee @me`.

**Then, for both branches**, ensure the issue is on the board and In Progress:

```bash
gh project item-add 2 --owner ettoreaquino --url <issue-url>
ISSUE_ITEM=$(gh project item-list 2 --owner ettoreaquino --limit 500 --format json --jq '.items[] | select(.content.number == <N>) | .id')
gh project item-edit --project-id PVT_kwHOAI_A384BTyaU --id "$ISSUE_ITEM" \
  --field-id PVTSSF_lAHOAI_A384BTyaUzhA-6Fg \
  --single-select-option-id 47fc9ee4
```

### Step 3: Push branch

1. If the branch has no upstream, push with `-u`: `git push -u origin <branch>`.
2. If already pushed, just `git push`.
3. If push is rejected, diagnose — do NOT force-push without user approval.

### Step 4: Create the PR

1. Analyze all commits on the branch (not just the latest) to draft:
   - **Title**: concise, under 70 characters, conventional commit style.
   - **Body**: summary bullets, `Closes #<N>` linking the issue, test plan.
2. Create the PR:
   ```
   gh pr create --title "..." --body "$(cat <<'EOF'
   ## Summary
   <bullets>

   Closes #<N>

   ## Test plan
   <checklist>

   🤖 Generated with [Claude Code](https://claude.com/claude-code)
   EOF
   )" --assignee @me
   ```

### Step 5: Add PR to project board

1. Add the PR to the devlair roadmap project:
   ```
   gh project item-add 2 --owner ettoreaquino --url <pr-url>
   ```
2. Set status to **In Progress**:
   ```
   PR_ITEM=$(gh project item-list 2 --owner ettoreaquino --limit 500 --format json --jq '.items[] | select(.content.number == <PR_NUMBER>) | .id')
   gh project item-edit --project-id PVT_kwHOAI_A384BTyaU --id "$PR_ITEM" \
     --field-id PVTSSF_lAHOAI_A384BTyaUzhA-6Fg \
     --single-select-option-id 47fc9ee4
   ```

### Step 6: Set the `Type` field on the PR (DORA scaffolding)

Parse the PR title's conventional-commit prefix and set the `Type` field. This powers DORA Deployment Frequency slicing (e.g. exclude `chore` release PRs from the count).

```bash
# Extract prefix: "feat(wizard): foo" -> "feat", "fix: bar" -> "fix"
TYPE_NAME=$(echo "<PR_TITLE>" | awk -F'[(:]' '{print $1}' | tr -d ' ')
case "$TYPE_NAME" in
  feat)     TYPE_OPT=fb49f55e ;;
  fix)      TYPE_OPT=8a8822f4 ;;
  chore)    TYPE_OPT=e4a0286c ;;
  docs)     TYPE_OPT=229100de ;;
  refactor) TYPE_OPT=428d2abe ;;
  *)        TYPE_OPT="" ;;  # leave field empty for unknown prefixes
esac
if [ -n "$TYPE_OPT" ]; then
  gh project item-edit --project-id PVT_kwHOAI_A384BTyaU --id "$PR_ITEM" \
    --field-id PVTSSF_lAHOAI_A384BTyaUzhTNn1g \
    --single-select-option-id "$TYPE_OPT"
fi
```

Idempotent: setting `Type=feat` twice is a no-op. Unknown prefixes leave the field blank rather than guessing.

### Step 7: Final reconciliation check

Quick verification that both items landed on the board with the expected status — surfaces silent no-ops from pagination or eventual-consistency races:

```bash
gh project item-list 2 --owner ettoreaquino --limit 500 --format json \
  --jq '.items[] | select(.content.number == <ISSUE_NUMBER> or .content.number == <PR_NUMBER>) | "#\(.content.number) \(.status)"'
```

Both lines must show `In Progress`. If either is missing or wrong, re-run Step 2 (issue) or Step 5 (PR) — they are idempotent.

### Step 8: Report

Print a summary:
- Issue: `#<N>` (created or existing)
- PR: `#<PR>` — URL
- Branch: `<branch>`
- Project board: both items In Progress, PR `Type=<feat|fix|...>`

### Project board reference

```
Project ID:     PVT_kwHOAI_A384BTyaU

Status field:   PVTSSF_lAHOAI_A384BTyaUzhA-6Fg
  Todo:         f75ad846
  In Progress:  47fc9ee4
  Done:         98236657

Type field:     PVTSSF_lAHOAI_A384BTyaUzhTNn1g
  feat:         fb49f55e
  fix:          8a8822f4
  chore:        e4a0286c
  docs:         229100de
  refactor:     428d2abe

Incident field: PVTSSF_lAHOAI_A384BTyaUzhTNn2A
  No:           2c582288
  Yes:          12d9b2e2
```

## User message

```text
$ARGUMENTS
```
