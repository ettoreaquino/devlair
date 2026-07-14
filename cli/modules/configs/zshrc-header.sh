# devlair — managed zsh config
export EDITOR=vim
export LANG=en_US.UTF-8

# zimfw
ZIM_HOME="$HOME/.zim"
if [[ ! -e "$ZIM_HOME/zimfw.zsh" ]]; then
  curl -fsSL --create-dirs -o "$ZIM_HOME/zimfw.zsh" \
    https://github.com/zimfw/zimfw/releases/latest/download/zimfw.zsh
fi
if [[ ! "$ZIM_HOME/init.zsh" -nt "$HOME/.zimrc" ]]; then
  source "$ZIM_HOME/zimfw.zsh" init -q
fi
source "$ZIM_HOME/init.zsh"

# Git branch in the prompt (oh-my-zsh dracula style) via zsh's built-in
# vcs_info. `formats` shows the branch when the cwd is a git repo; the empty
# `${vcs_info_msg_0_}` expands to nothing elsewhere. PROMPT_SUBST lets the
# variable expand fresh each render, and precmd refreshes it before each prompt.
autoload -Uz vcs_info
zstyle ':vcs_info:git:*' formats ' %F{#bd93f9}(%b)%f'
zstyle ':vcs_info:git:*' actionformats ' %F{#bd93f9}(%b|%a)%f'
zstyle ':vcs_info:*' enable git
_devlair_vcs_precmd() { vcs_info }
precmd_functions+=( _devlair_vcs_precmd )
setopt PROMPT_SUBST

# Minimal arrow prompt (Dracula palette) — overrides the dracula/zsh theme's
# default `user@host path %` format. Must come after init.zsh so it wins over
# the theme's own PROMPT assignment. Appends the git branch when in a repo,
# e.g. `➜ iot-edge (main)`.
PROMPT='%(?.%F{#50fa7b}.%F{#ff5555})➜%f %F{#8be9fd}%1~%f${vcs_info_msg_0_} '

# zimfw's `environment` module turns on NO_CLOBBER, which makes `>>` to a
# *nonexistent* file an error (e.g. Homebrew's `... >> ~/.zprofile` on a clean
# machine). APPEND_CREATE lets `>>` create the file while keeping NO_CLOBBER's
# protection against clobbering existing files with `>`. Set after init.zsh so
# it survives zimfw's option setup.
setopt APPEND_CREATE
