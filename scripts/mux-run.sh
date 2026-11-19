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

run_in_rex() {
  local mode=$1
  local direction=$2
  local fullscreen=$3
  shift 3

  require_command rex
  require_command jq

  # shortcut: Rex block closes when its command exits, so no cleanup step; upgrade if pane must outlive command
  local rex_split=right
  [[ $direction == down ]] && rex_split=below

  local block_id
  block_id=$(
    rex split --json --focus --cwd "$PWD" --split "$rex_split" -- "$@" |
      jq -er '.block_ids[0] | strings | select(length > 0)'
  ) || fail "could not create Rex block"

  if [[ $mode == popup ]]; then
    if ! rex zoom --on -b "$block_id" >/dev/null; then
      rex block close "$block_id" >/dev/null 2>&1 || true
      fail "could not zoom Rex block $block_id"
    fi
  fi
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

  [[ -n ${REX_BLOCK:-} ]] || fail "not running inside Rex"
  run_in_rex "$mode" "$direction" "$fullscreen" "$@"
}

main "$@"
