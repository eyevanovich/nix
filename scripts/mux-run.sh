#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage:
  mux-run popup [--fullscreen] -- COMMAND [ARG...]
  mux-run split <right|down> -- COMMAND [ARG...]
EOF
}

fail() {
  printf 'mux-run: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

parse_pane_id() {
  jq -er '.result.pane.pane_id | strings | select(length > 0)'
}

create_command_script() {
  local pane_id=$1
  local close_pane=$2
  local herdr_bin=$3
  shift 3

  local script_path
  script_path=$(mktemp /tmp/mux-run.XXXXXX)

  {
    printf '#!/usr/bin/env bash\n'
    printf 'set +e\n'
    printf 'script_path=%q\n' "$script_path"
    printf 'cleanup() {\n'
    printf '  local status=$?\n'
    printf '  trap - EXIT HUP INT TERM\n'
    printf '  rm -f -- "$%s"\n' script_path
    if [[ $close_pane == true ]]; then
      printf '  %q pane close %q >/dev/null 2>&1 || true\n' "$herdr_bin" "$pane_id"
    fi
    printf '  exit "$%s"\n' status
    printf '}\n'
    printf 'trap cleanup EXIT HUP INT TERM\n'
    printf '%q ' "$@"
    printf '\n'
  } >"$script_path"

  chmod 700 "$script_path"
  printf '%s\n' "$script_path"
}

open_herdr_pane() {
  local herdr_bin=$1
  local direction=$2
  local response

  response=$(
    "$herdr_bin" pane split --current \
      --direction "$direction" \
      --cwd "$PWD" \
      --focus
  )

  printf '%s\n' "$response" | parse_pane_id
}

run_in_herdr() {
  local mode=$1
  local direction=$2
  shift 2

  require_command herdr
  require_command jq

  local herdr_bin pane_id script_path
  herdr_bin=$(command -v herdr)
  pane_id=$(open_herdr_pane "$herdr_bin" "$direction")

  if [[ $mode == popup ]]; then
    if ! "$herdr_bin" pane zoom "$pane_id" --on >/dev/null; then
      "$herdr_bin" pane close "$pane_id" >/dev/null 2>&1 || true
      fail "could not zoom Herdr pane $pane_id"
    fi
    script_path=$(create_command_script "$pane_id" true "$herdr_bin" "$@")
  else
    script_path=$(create_command_script "$pane_id" false "$herdr_bin" "$@")
  fi

  if ! "$herdr_bin" pane run "$pane_id" "bash $script_path" >/dev/null; then
    rm -f -- "$script_path"
    "$herdr_bin" pane close "$pane_id" >/dev/null 2>&1 || true
    fail "could not run command in Herdr pane $pane_id"
  fi
}

run_in_zellij() {
  local mode=$1
  local direction=$2
  local fullscreen=$3
  shift 3

  require_command zellij

  if [[ $mode == popup ]]; then
    local args=(run -fc)
    if [[ $fullscreen == true ]]; then
      args+=(--height '100%' --width '100%' -x 0 -y 0)
    fi
    zellij "${args[@]}" -- "$@"
    return
  fi

  zellij run -d "$direction" -- "$@"
}

main() {
  local mode=${1:-}
  local direction=right
  local fullscreen=false

  case "$mode" in
    popup)
      shift
      if [[ ${1:-} == --fullscreen ]]; then
        fullscreen=true
        shift
      fi
      ;;
    split)
      direction=${2:-}
      [[ $direction == right || $direction == down ]] || {
        usage
        fail "split direction must be right or down"
      }
      shift 2
      ;;
    -h | --help)
      usage
      return
      ;;
    *)
      usage
      fail "expected popup or split"
      ;;
  esac

  if [[ ${1:-} == -- ]]; then
    shift
  fi
  (($# > 0)) || {
    usage
    fail "missing command"
  }

  if [[ -n ${HERDR_PANE_ID:-} ]]; then
    run_in_herdr "$mode" "$direction" "$@"
  elif [[ -n ${ZELLIJ:-} ]]; then
    run_in_zellij "$mode" "$direction" "$fullscreen" "$@"
  else
    fail "not running inside Herdr or Zellij"
  fi
}

main "$@"
