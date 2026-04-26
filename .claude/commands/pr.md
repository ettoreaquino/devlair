---
description: Create a PR following the project SDLC — ensures issue exists, links PR, assigns, and adds to project board.
allowed-tools: Bash, Read, Grep, Glob
---

## Instructions

You are creating a pull request that follows the devlair SDLC practices. Every PR must have a linked issue, be assigned, and be tracked on the project board.

**Assignment rule:** the linked issue AND the PR must be assigned to the developer running this command. Always pass `--assignee @me` (gh resolves it to the authenticated user) — never hardcode a username. This applies whether the issue is newly created or already existed.

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

### Step 2: Ensure an issue exists

If an issue number was provided in `$ARGUMENTS`:
1. Verify it exists: `gh issue view <number> --json number,assignees`.
2. If it doesn't exist, stop and report the error.
3. If the current user is not already among `assignees`, attach them: `gh issue edit <number> --add-assignee @me`. Never remove existing assignees.

If no issue number was provided:
1. Analyze the commits and diff to understand the scope of work.
2. Draft an issue title and body describing the work.
3. Create it: `gh issue create --title "..." --body "..." --assignee @me`.
4. Add the issue to the project board as **In Progress**:
   ```
   gh project item-add 2 --owner ettoreaquino --url <issue-url>
   ```
   Then set status:
   ```
   ITEM_ID=$(gh project item-list 2 --owner ettoreaquino --format json --jq '.items[] | select(.content.number == <N>) | .id')
   gh project item-edit --project-id PVT_kwHOAI_A384BTyaU --id "$ITEM_ID" \
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
   PR_ITEM=$(gh project item-list 2 --owner ettoreaquino --format json --jq '.items[] | select(.content.number == <PR_NUMBER>) | .id')
   gh project item-edit --project-id PVT_kwHOAI_A384BTyaU --id "$PR_ITEM" \
     --field-id PVTSSF_lAHOAI_A384BTyaUzhA-6Fg \
     --single-select-option-id 47fc9ee4
   ```

### Step 6: Also set the linked issue to In Progress (if not already)

```
ISSUE_ITEM=$(gh project item-list 2 --owner ettoreaquino --format json --jq '.items[] | select(.content.number == <ISSUE_NUMBER>) | .id')
gh project item-edit --project-id PVT_kwHOAI_A384BTyaU --id "$ISSUE_ITEM" \
  --field-id PVTSSF_lAHOAI_A384BTyaUzhA-6Fg \
  --single-select-option-id 47fc9ee4
```

### Step 7: Report

Print a summary:
- Issue: `#<N>` (created or existing)
- PR: `#<PR>` — URL
- Branch: `<branch>`
- Project board: both items set to **In Progress**

### Project board reference

```
Project ID:     PVT_kwHOAI_A384BTyaU
Field ID:       PVTSSF_lAHOAI_A384BTyaUzhA-6Fg
Status options:
  Todo:         f75ad846
  In Progress:  47fc9ee4
  Done:         98236657
```

## User message

```text
$ARGUMENTS
```
