import shutil
from pathlib import Path

from devlair.context import CheckItem, ModuleResult, SetupContext
from devlair import runner

LABEL = "tmux"

TPM_DIR = "~/.tmux/plugins/tpm"

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

# ── Copy mode (vi + mouse + OSC 52) ─────────────────────────────────────
set -g mode-keys vi
set -g set-clipboard on

# v begins selection, C-v toggles rectangle, y yanks
bind -T copy-mode-vi v   send-keys -X begin-selection
bind -T copy-mode-vi C-v send-keys -X rectangle-toggle
bind -T copy-mode-vi y   send-keys -X copy-selection-and-cancel

# Mouse drag auto-copies on release
bind -T copy-mode-vi MouseDragEnd1Pane send-keys -X copy-selection-and-cancel

# Right-click paste
bind -n MouseDown3Pane paste-buffer

# ── Claude Code popup ────────────────────────────────────────────────────────
# Prefix+y opens a persistent Claude Code session per project directory
bind -r y run-shell ' \\
  SESSION="claude-$(echo #{pane_current_path} | md5sum | cut -c1-8)"; \\
  tmux has-session -t "$SESSION" 2>/dev/null || \\
  tmux new-session -d -s "$SESSION" -c "#{pane_current_path}" "claude"; \\
  tmux display-popup -w80% -h80% -E "tmux attach-session -t $SESSION"'

# ── Claude Code passthrough ──────────────────────────────────────────────────
# Prefix+o sends Ctrl-o to the pane (used by Claude Code to expand details)
bind o send-keys C-o

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
set -g status-right                 "#[bg=#{D_BG},fg=#{D_CYAN}]#(~/.devlair/bin/claude-status.sh) #[bg=#{D_BG},fg=#{D_GREEN}] #(git -C #{pane_current_path} branch --show-current 2>/dev/null) #[bg=#{D_COMMENT},fg=#{D_FG}] %H:%M #[bg=#{D_CURRENT},fg=#{D_FG}] %d %b "
set -g status-right-length          80
setw -g window-status-current-style "bg=#{D_CURRENT} fg=#{D_CYAN} bold"
setw -g window-status-current-format" #I #W "
setw -g window-status-style         "bg=#{D_BG} fg=#{D_COMMENT}"
setw -g window-status-format        " #I #W "
set -g pane-border-style            "fg=#{D_CURRENT}"
set -g pane-active-border-style     "fg=#{D_PURPLE}"
set -g message-style                "bg=#{D_CURRENT} fg=#{D_YELLOW}"

# ── Convenience alias ────────────────────────────────────────────────────────
bind t new-session -A -s dev

# ── Plugins (TPM) ────────────────────────────────────────────────────────────
set -g @plugin 'tmux-plugins/tpm'
set -g @plugin 'tmux-plugins/tmux-resurrect'
set -g @resurrect-processes 'false'
set -g @plugin 'tmux-plugins/tmux-continuum'
set -g @continuum-restore 'on'
set -g @continuum-save-interval '15'

run '~/.tmux/plugins/tpm/tpm'
"""


def run(ctx: SetupContext) -> ModuleResult:
    conf = ctx.user_home / ".tmux.conf"
    conf.write_text(TMUX_CONF)
    shutil.chown(conf, ctx.username, ctx.username)

    tpm_path = ctx.user_home / ".tmux" / "plugins" / "tpm"
    if not tpm_path.exists():
        runner.run(
            ["git", "clone", "https://github.com/tmux-plugins/tpm", str(tpm_path)],
        )
        runner.run(["chown", "-R", f"{ctx.username}:{ctx.username}", str(tpm_path)])

    return ModuleResult(status="ok", detail="Dracula theme + TPM/resurrect applied")


def check() -> list[CheckItem]:
    tmux_ok = runner.cmd_exists("tmux")
    tpm_ok = Path(TPM_DIR).expanduser().exists()
    return [
        CheckItem(label="tmux installed", status="ok" if tmux_ok else "fail"),
        CheckItem(
            label=".tmux.conf",
            status="ok" if Path("~/.tmux.conf").expanduser().exists() else "warn",
        ),
        CheckItem(label="TPM installed", status="ok" if tpm_ok else "warn"),
    ]
