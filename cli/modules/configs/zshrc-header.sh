# devlair — managed zsh config
export EDITOR=vim
export LANG=en_US.UTF-8

# Path
export PATH="$HOME/.local/bin:$PATH"

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

# zimfw's `environment` module turns on NO_CLOBBER, which makes `>>` to a
# *nonexistent* file an error (e.g. Homebrew's `... >> ~/.zprofile` on a clean
# machine). APPEND_CREATE lets `>>` create the file while keeping NO_CLOBBER's
# protection against clobbering existing files with `>`. Set after init.zsh so
# it survives zimfw's option setup.
setopt APPEND_CREATE
