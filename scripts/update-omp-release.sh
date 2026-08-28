#!/usr/bin/env bash
# Update the OMP flake input to GitHub's latest stable release tag.
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

for command in gh git nix awk; do
  command -v "$command" >/dev/null || {
    echo "error: required command not found: $command" >&2
    exit 1
  }
done

tag="$(gh api repos/can1357/oh-my-pi/releases/latest --jq '.tag_name')"
if [[ ! "$tag" =~ ^v[0-9]+(\.[0-9]+){2}([-.][0-9A-Za-z.-]+)?$ ]]; then
  echo "error: GitHub returned an unexpected OMP release tag: $tag" >&2
  exit 1
fi

git ls-remote --exit-code --refs https://github.com/can1357/oh-my-pi.git "refs/tags/$tag" >/dev/null

backup_dir="$(mktemp -d)"
cp flake.nix "$backup_dir/flake.nix"
if [[ -f flake.lock ]]; then
  cp flake.lock "$backup_dir/flake.lock"
fi

updated=false
restore_on_failure() {
  status=$?
  if [[ "$updated" != true ]]; then
    cp "$backup_dir/flake.nix" flake.nix
    if [[ -f "$backup_dir/flake.lock" ]]; then
      cp "$backup_dir/flake.lock" flake.lock
    else
      rm -f flake.lock
    fi
  fi
  rm -rf "$backup_dir"
  exit "$status"
}
trap restore_on_failure EXIT

tmp_flake="$(mktemp flake.nix.XXXXXX)"
if ! awk -v tag="$tag" '
  /^[[:space:]]*omp\.url = "github:can1357\/oh-my-pi\/v[^"]+";$/ {
    print "    omp.url = \"github:can1357/oh-my-pi/" tag "\";"
    replacements += 1
    next
  }
  { print }
  END {
    if (replacements != 1) {
      exit 1
    }
  }
' flake.nix >"$tmp_flake"; then
  rm -f "$tmp_flake"
  echo "error: expected exactly one OMP flake input URL" >&2
  exit 1
fi
mv "$tmp_flake" flake.nix

nix flake lock --update-input omp
updated=true

echo "OMP is pinned to $tag. Rebuild with: task rebuild"
