#!/usr/bin/env bash
set -euo pipefail

# Pass the built Home Manager activation package as the first argument.
generation="$1"
activation="$generation/activate"
prepare=$(awk '$1 == "run" && $2 ~ /\/bin\/prepare-karabiner-config$/ { print $2; exit }' "$activation")
cleanup=$(awk '/xargs -0 bash .*cleanup/ { print $5; exit }' "$activation")
awk '
  /Activating %s.*"writeBoundary"/ { boundary = NR }
  /Activating %s.*"prepareKarabinerConfig"/ { prepare = NR }
  /Activating %s.*"linkGeneration"/ { link = NR }
  END { exit !(boundary && boundary < prepare && prepare < link) }
' "$activation"
seed="$(dirname "$0")/../dotfiles/karabiner/karabiner.json"
root=$(mktemp -d)
trap 'rm -rf "$root"' EXIT

relative=.config/karabiner/karabiner.json
config="$root/home/$relative"
cleanup_config() (
  export HOME="$root/home"
  eval "$(awk '/^export PATH=/ { print; exit }' "$activation")"
  bash "$cleanup" "$generation/home-files" "$relative"
)
legacy="$root/test-home-manager-files"
mkdir -p "$legacy/$(dirname "$relative")"
printf '{"profiles":[]}\n' > "$legacy/$relative"
old=$(nix-store --add "$legacy")

"$prepare" "$config"
cmp "$seed" "$config"
test "$(stat -f %Lp "$config")" = 600

rm "$config"
ln -s "$old/$relative" "$config"
cleanup_config
test ! -L "$config"
test ! -e "$config"

mkdir -p "$(dirname "$config")"
ln -s "$old/$relative" "$config"
"$prepare" "$config"
cleanup_config
test ! -L "$config"
test -w "$config"
cmp "$legacy/$relative" "$config"

printf '{}\n' > "$config"
"$prepare" "$config"
cleanup_config
test "$(< "$config")" = '{}'

rm "$config"
ln -s "$root/missing" "$config"
"$prepare" "$config"
test "$(readlink "$config")" = "$root/missing"
