import sys

from rich.console import Console
from rich.theme import Theme

# Bare WSL ships with C/POSIX locale → Python stdout is ascii → Rich
# cannot render box-drawing characters.  Reconfigure to UTF-8 early so
# Panel borders, the logo, and status icons display correctly everywhere.
if hasattr(sys.stdout, "reconfigure"):
    try:
        if (sys.stdout.encoding or "").lower().replace("-", "") != "utf8":
            sys.stdout.reconfigure(encoding="utf-8")
        if (sys.stderr.encoding or "").lower().replace("-", "") != "utf8":
            sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Dracula palette
D_BG = "#282a36"
D_CURRENT = "#44475a"
D_FG = "#f8f8f2"
D_COMMENT = "#6272a4"
D_CYAN = "#8be9fd"
D_GREEN = "#50fa7b"
D_ORANGE = "#ffb86c"
D_PINK = "#ff79c6"
D_PURPLE = "#bd93f9"
D_RED = "#ff5555"
D_YELLOW = "#f1fa8c"

DRACULA = Theme(
    {
        "info": f"bold {D_CYAN}",
        "success": f"bold {D_GREEN}",
        "warning": f"bold {D_ORANGE}",
        "error": f"bold {D_RED}",
        "accent": f"bold {D_PURPLE}",
        "muted": D_COMMENT,
        "heading": f"bold {D_FG}",
        "step": D_PINK,
        "detail": D_CYAN,
    }
)

console = Console(theme=DRACULA)
