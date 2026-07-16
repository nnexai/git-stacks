export PHASE124_PROFILE_SHELL=zsh
export PATH="$HOME/.phase124-nvm/bin:$PATH"
alias phase124_alias='printf "alias:%s\n" "$PHASE124_PROFILE_SHELL"'
phase124_function() { printf 'function:%s:%s\n' "$PHASE124_PROFILE_SHELL" "$1"; }
printf 'phase124-pty-startup:zsh\n'
