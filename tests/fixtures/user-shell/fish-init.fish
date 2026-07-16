set -gx PHASE124_PROFILE_SHELL fish
set -gx PATH "$HOME/.phase124-nvm/bin" $PATH
alias phase124_alias 'printf "alias:%s\n" "$PHASE124_PROFILE_SHELL"'
function phase124_function
    printf 'function:%s:%s\n' "$PHASE124_PROFILE_SHELL" "$argv[1]"
end
printf 'phase124-pty-startup:fish\n'
