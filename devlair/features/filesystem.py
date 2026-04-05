import json
import subprocess
from pathlib import Path

import typer
from rich.tree import Tree

from devlair import runner
from devlair.console import D_COMMENT, D_GREEN, D_PURPLE, console

STATE_FILE = Path.home() / ".devlair" / "filesystem.json"

SYSTEM_PROMPT = """\
You are a helpful assistant that designs folder structures for developers.
Ask the user 3-5 short questions about their work (role, project types, workflows, tools).
Then propose a clean home directory structure as a JSON object where keys are folder paths
(relative to ~) and values are short descriptions.
Keep it minimal: 6-10 top-level folders max. No deeply nested structure in the proposal.
Format the final proposal as valid JSON inside a ```json ... ``` block.
"""


def run_filesystem() -> None:
    if not runner.cmd_exists("claude"):
        console.print()
        console.print("  [warning]Claude CLI not found.[/warning]")
        console.print("  Install it first: [detail]npm install -g @anthropic-ai/claude-code[/detail]")
        console.print()
        raise typer.Exit(1)

    console.print()
    console.print("  Claude will ask you a few questions to design your folder structure.")
    console.print("  [muted]Type your answers and press Enter. Claude will propose a structure at the end.[/muted]")
    console.print()

    # Run claude in interactive print mode with our system prompt
    result = subprocess.run(
        [
            "claude",
            "--system",
            SYSTEM_PROMPT,
            "-p",
            "Hello! Let's design the folder structure for your home directory. "
            "First, what kind of work do you primarily do? (e.g. ML research, web dev, data engineering, etc.)",
        ],
        text=True,
    )

    if result.returncode != 0:
        console.print("  [error]Claude session ended unexpectedly.[/error]")
        raise typer.Exit(1)

    # Ask user to paste the JSON proposal if claude printed it non-interactively
    console.print()
    raw = typer.prompt(
        "  Paste the JSON structure Claude proposed (or leave blank to skip)",
        default="",
    )
    if not raw.strip():
        console.print("  [muted]Skipped. Run 'devlair filesystem' again when ready.[/muted]")
        return

    # Extract JSON from ```json ... ``` block if present
    if "```json" in raw:
        raw = raw.split("```json")[1].split("```")[0].strip()
    elif "```" in raw:
        raw = raw.split("```")[1].split("```")[0].strip()

    try:
        structure: dict[str, str] = json.loads(raw)
    except json.JSONDecodeError as exc:
        console.print(f"  [error]Could not parse JSON: {exc}[/error]")
        raise typer.Exit(1)

    # Display the proposed tree
    console.print()
    tree = Tree(f"[bold {D_PURPLE}]~[/]")
    for folder, desc in structure.items():
        tree.add(f"[{D_GREEN}]{folder}[/]  [{D_COMMENT}]{desc}[/]")
    console.print(tree)
    console.print()

    if not typer.confirm("  Create this structure?", default=True):
        console.print("  Aborted.")
        return

    home = Path.home()
    created = []
    for folder in structure:
        target = home / folder
        target.mkdir(parents=True, exist_ok=True)
        created.append(str(target))

    # Persist for reproducibility
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(structure, indent=2))

    console.print()
    console.print(f"  [success]✓  {len(created)} folders created.[/success]")
    console.print(f"  [muted]Saved to {STATE_FILE}[/muted]")
    console.print()
