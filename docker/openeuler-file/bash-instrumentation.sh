if [ -f ~/.bashrc ]; then
  # shellcheck source=/dev/null
  source ~/.bashrc
fi

export LINUX_AI_SESSION_DIR="${LINUX_AI_SESSION_DIR:-/tmp/linux-ai-session}"
export LINUX_AI_PANE_LOG="$LINUX_AI_SESSION_DIR/pane.log"
export LINUX_AI_EVENTS="$LINUX_AI_SESSION_DIR/command_events.jsonl"
touch "$LINUX_AI_PANE_LOG" "$LINUX_AI_EVENTS" 2>/dev/null || true

__linux_ai_command=""
__linux_ai_cwd=""
__linux_ai_started_at=""
__linux_ai_output_offset="0"
__linux_ai_in_prompt="0"
__linux_ai_last_recorded=""

__linux_ai_now() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

__linux_ai_offset() {
  if [ -f "$LINUX_AI_PANE_LOG" ]; then
    wc -c < "$LINUX_AI_PANE_LOG" 2>/dev/null | tr -d ' '
  else
    printf '0'
  fi
}

__linux_ai_debug_trap() {
  [ "$__linux_ai_in_prompt" = "1" ] && return
  case "$BASH_COMMAND" in
    __linux_ai_*|trap\ *|PROMPT_COMMAND=*|PS1=*|history\ *|printf\ *PS1*|printf\ *\\033k*|*\\033k%s@%s:%s\\033*) return ;;
  esac
  [ -z "$BASH_COMMAND" ] && return
  __linux_ai_command="$BASH_COMMAND"
  __linux_ai_cwd="$PWD"
  __linux_ai_started_at="$(__linux_ai_now)"
  __linux_ai_output_offset="$(__linux_ai_offset)"
}

__linux_ai_prompt_command() {
  local exit_code=$?
  __linux_ai_in_prompt="1"
  if [ -n "$__linux_ai_command" ] && [ "$__linux_ai_command" != "$__linux_ai_last_recorded" ]; then
    LINUX_AI_COMMAND="$__linux_ai_command" \
    LINUX_AI_CWD="$__linux_ai_cwd" \
    LINUX_AI_EXIT_CODE="$exit_code" \
    LINUX_AI_STARTED_AT="$__linux_ai_started_at" \
    LINUX_AI_OUTPUT_OFFSET="$__linux_ai_output_offset" \
      python3 /opt/linux-ai/record_command_event.py >/dev/null 2>&1 || true
    __linux_ai_last_recorded="$__linux_ai_command"
  fi
  __linux_ai_command=""
  __linux_ai_in_prompt="0"
}

if [ -n "$PROMPT_COMMAND" ]; then
  PROMPT_COMMAND="__linux_ai_prompt_command; $PROMPT_COMMAND"
else
  PROMPT_COMMAND="__linux_ai_prompt_command"
fi

PS1='[\u@\h \W]\$ '
trap '__linux_ai_debug_trap' DEBUG
