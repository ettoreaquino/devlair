---
name: board
description: Show the current state of all epics and issues on the devlair roadmap project board
user_invocable: true
---

# devlair Roadmap Board

Display the current status of all epics and their child issues from the devlair GitHub Projects board.

## Instructions

Run these commands to gather the board state, then present it clearly:

1. List all epics:
```bash
gh issue list --repo ettoreaquino/devlair --label epic --state all --json number,title,state
```

2. List all open issues with labels and assignees:
```bash
gh issue list --repo ettoreaquino/devlair --state all --json number,title,state,labels,assignees --limit 100
```

3. Get project board item statuses:
```bash
gh project item-list 2 --owner ettoreaquino --limit 100 --format json
```

## Output Format

Present the results as a summary table grouped by epic, showing:

- Epic title and state (OPEN/CLOSED)
- Child issues with their status from the project board (Todo / In Progress / Done)
- Which issues are ready to start (no blockers) vs blocked

Use this dependency graph for Epic #2 to determine blockers:
```
#37 (scaffold) --> #38 (logo+help)
                --> #39 (protocol+runner) --> #40 (extract modules)
                --> #41 (registry+platform)
                --> #47 (CI/CD)

#40 + #41 --> #42 (init) --> #43 (wizard)
#42 --> #44 (doctor+upgrade)
#42 --> #45 (remaining commands)
#41 --> #46 (profiles)
#47 --> #48 (migration)
```

End with a one-line summary: "X of Y issues done, Z ready to start next."
