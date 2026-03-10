import shutil
from pathlib import Path

from devlair.context import CheckItem, ModuleResult, SetupContext
from devlair import runner

LABEL = "tmux"

TMUX_CONF = """\
# ── Prefix ───────────────────────────────────────────────────────────────────
unbind C-b
set -g prefix C-a
bind C-a send-prefix

# ── General ──────────────────────────────────────────────────────────────────
set -g mouse on
set -g history-limit 50000
set -g base-index 1
set -g pane-base-index 1
set -g allow-rename off
set -sg escape-time 10
set -g default-terminal "screen-256color"
set -ga terminal-overrides ",xterm-256color:Tc"

# ── Splits ───────────────────────────────────────────────────────────────────
bind | split-window -h -c "#{pane_current_path}"
bind - split-window -v -c "#{pane_current_path}"

# ── Navigation ───────────────────────────────────────────────────────────────
bind -r n next-window
bind -r p previous-window
bind r source-file ~/.tmux.conf \\; display "Reloaded"

# ── Dracula theme ─────────────────────────────────────────────────────────────
# https://draculatheme.com
D_BG="#282a36"
D_CURRENT="#44475a"
D_FG="#f8f8f2"
D_COMMENT="#6272a4"
D_CYAN="#8be9fd"
D_GREEN="#50fa7b"
D_ORANGE="#ffb86c"
D_PINK="#ff79c6"
D_PURPLE="#bd93f9"
D_RED="#ff5555"
D_YELLOW="#f1fa8c"

set -g status-style                 "bg=#{D_BG} fg=#{D_FG}"
set -g status-left                  "#[bg=#{D_PURPLE},fg=#{D_BG},bold] #S #[bg=#{D_BG},fg=#{D_PURPLE}] "
set -g status-left-length           20
set -g status-right                 "#[bg=#{D_BG},fg=#{D_GREEN}] #(git -C #{pane_current_path} branch --show-current 2>/dev/null) #[bg=#{D_COMMENT},fg=#{D_FG}] %H:%M #[bg=#{D_CURRENT},fg=#{D_FG}] %d %b "
set -g status-right-length          60
setw -g window-status-current-style "bg=#{D_CURRENT} fg=#{D_CYAN} bold"
setw -g window-status-current-format" #I #W "
setw -g window-status-style         "bg=#{D_BG} fg=#{D_COMMENT}"
setw -g window-status-format        " #I #W "
set -g pane-border-style            "fg=#{D_CURRENT}"
set -g pane-active-border-style     "fg=#{D_PURPLE}"
set -g message-style                "bg=#{D_CURRENT} fg=#{D_YELLOW}"

# ── Convenience alias ────────────────────────────────────────────────────────
bind t new-session -A -s dev
"""


def run(ctx: SetupContext) -> ModuleResult:
    conf = ctx.user_home / ".tmux.conf"
    conf.write_text(TMUX_CONF)
    shutil.chown(conf, ctx.username, ctx.username)
    return ModuleResult(status="ok", detail="Dracula theme applied")


def check() -> list[CheckItem]:
    tmux_ok = runner.cmd_exists("tmux")
    return [
        CheckItem(label="tmux installed", status="ok" if tmux_ok else "fail"),
        CheckItem(
            label=".tmux.conf",
            status="ok" if Path("~/.tmux.conf").expanduser().exists() else "warn",
        ),
    ]
