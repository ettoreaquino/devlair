---
description: Audit and repair the devlair roadmap project board. Idempotent — re-runs are safe and report zero drift after a successful run.
allowed-tools: Bash, Read, Grep, Glob
---

## Instructions

You are reconciling the **devlair roadmap** GitHub Project v2 (#2) against the canonical state in GitHub Issues and Pull Requests. Drift sources we know about:

- Open issues/PRs that bypassed `/pr` and never landed on the board.
- Closed items still sitting in `Todo` / `In Progress` (built-in workflow disabled at the time, or a manual edit overrode the auto-close).
- Open items wrongly marked `Done`.
- Items missing the `Type` field (DORA scaffolding).
- Release-please bot PRs (`chore(main): release ...`) that got auto-added by mistake — they're noise for Deployment Frequency.

**Idempotency contract:** every repair is a set-to-desired-state write, never a transition. Running `/board-reconcile --fix` twice in a row must report zero drift on the second run. Do not implement compare-and-swap logic; do not add "if currently X then Y" branches.

### Argument parsing

Parse `$ARGUMENTS` for:
- `--fix` — apply repairs. Default is dry-run (no writes).
- `--scope=this-pr` — only check the PR linked to the current branch (used by `/pr` for its end-of-flow sanity check). Default is full board.

### Step 1: Snapshot canonical state

Run in parallel:

```bash
# Open issues and PRs (canonical: should all be on the board, not Done)
gh issue list --state open --limit 500 --json number,title,state
gh pr list --state open --limit 500 --json number,title,state

# Closed/merged items (canonical: if on the board, must be Done)
gh issue list --state closed --limit 500 --json number,title,state,closedAt
gh pr list --state merged --limit 500 --json number,title,state,mergedAt

# Current board state
gh project item-list 2 --owner ettoreaquino --limit 500 --format json
```

Always pass `--limit 500` — the default 100 silently truncates on this project.

### Step 2: Detect drift

Build a single drift report. Each row: `{number, kind, current, desired, repair}`.

| Detector | Desired state | Repair when `--fix` |
|---|---|---|
| Open issue not on board | on board, Status=Todo | `item-add` then status Todo |
| Open PR not on board | on board, Status=In Progress | `item-add` then status In Progress |
| Closed issue / merged PR on board, Status ≠ Done | Status=Done | `item-edit` → Done |
| Open issue/PR on board, Status=Done | Status=Todo (issue) or In Progress (PR) | `item-edit` → correct status |
| Item on board with no `Type` field set, where title has a parseable conventional-commit prefix | `Type=<prefix>` | `item-edit` Type field |
| PR on board with title matching `^chore\(main\): release` | not on board | `item-delete` |

For the `Type` mapping, use the same prefix→option-id table from `/pr` Step 6.

### Step 3: Print the drift report

Always print, regardless of mode:

```
Board reconciliation — <YYYY-MM-DD HH:MM> (dry-run | fix)

Open items missing from board:
  #92  issue  init.tsx: improve stderr fallback ...

Status mismatches:
  #81  issue  CLOSED -> In Progress (should be Done)
  #84  issue  CLOSED -> In Progress (should be Done)

Missing Type field:
  #125 pr     fix(wizard): memoize context ...        -> fix

Bot PRs to drop:
  #126 pr     chore(main): release devlair-cli 2.5.1-alpha.1

Summary: 4 drift items detected.
```

If `--scope=this-pr`, restrict the report to the two relevant items (linked issue + the PR for the current branch).

### Step 4: Apply repairs (only when `--fix`)

For each drift row, run the repair from the table above. After each `item-add`, look up the item ID with `--limit 500` before calling `item-edit`. Catch and report any individual failure but continue with the rest — one bad row shouldn't abort the reconciliation.

After all repairs, **re-run Step 1 and Step 2** as a self-check. The second pass must report zero drift; if it doesn't, surface the residual rows as a failure rather than claiming success.

### Step 5: Schedule reminder

If running in `--fix` mode without `--scope=this-pr`, end with:

```
Next reconciliation: <today + 7 days>. Drift detected here was probably from non-/pr commands; consider running /board-reconcile --fix weekly.
```

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
