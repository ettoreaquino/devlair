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
# vcs_info. formats carries only the raw branch/action — no color escapes — so
# we can safely escape the whole message below; the color is applied in PROMPT.
autoload -Uz vcs_info
zstyle ':vcs_info:git:*' formats '%b'
zstyle ':vcs_info:git:*' actionformats '%b|%a'
zstyle ':vcs_info:*' enable git

# Rebuild PROMPT each render so the branch tracks cd/checkout.
# SECURITY: a branch name is attacker-controlled — anyone who can name a branch
# in a repo you clone or cd into controls this string. We deliberately do NOT
# enable PROMPT_SUBST: with it, a branch like `$(rm -rf ~)` would be command-
# substituted on every prompt render. Instead the branch is baked into PROMPT as
# a literal, with its `%` doubled to `%%` so it can't smuggle in prompt escapes.
_devlair_set_prompt() {
  vcs_info
  local branch=${vcs_info_msg_0_//\%/%%}
  local git_seg=""
  [[ -n $branch ]] && git_seg=" %F{#bd93f9}(${branch})%f"
  # Minimal arrow prompt (Dracula palette) — overrides the dracula/zsh theme's
  # `user@host path %` format. e.g. `➜ iot-edge (main)`.
  PROMPT="%(?.%F{#50fa7b}.%F{#ff5555})➜%f %F{#8be9fd}%1~%f${git_seg} "
}
precmd_functions+=( _devlair_set_prompt )

# zimfw's `environment` module turns on NO_CLOBBER, which makes `>>` to a
# *nonexistent* file an error (e.g. Homebrew's `... >> ~/.zprofile` on a clean
# machine). APPEND_CREATE lets `>>` create the file while keeping NO_CLOBBER's
# protection against clobbering existing files with `>`. Set after init.zsh so
# it survives zimfw's option setup.
setopt APPEND_CREATE
