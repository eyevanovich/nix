{lib, ...}: {
  home.sessionPath = ["$HOME/.local/bin"];

  home.activation.installBeads = lib.hm.dag.entryAfter ["writeBoundary"] ''
    PATH="/usr/bin:/bin:$PATH"

    echo "Checking beads version..."

    if [ -x "$HOME/.local/bin/bd" ]; then
      current=$($HOME/.local/bin/bd version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
      echo "Current: $current"
    else
      current=""
      echo "Not installed"
    fi

    latest_json=$(/usr/bin/curl -sSL --connect-timeout 5 https://api.github.com/repos/steveyegge/beads/releases/latest 2>/dev/null)
    if [ -z "$latest_json" ]; then
      echo "Warning: Could not reach GitHub, skipping beads check"
      exit 0
    fi
    latest=$(echo "$latest_json" | /usr/bin/grep '"tag_name"' | sed -E 's/.*"v([^"]+)".*/\1/')
    echo "Latest: $latest"

    if [ "$current" != "$latest" ]; then
      echo "Installing beads $latest..."
      /usr/bin/curl -sSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash
    else
      echo "beads is up to date"
    fi
  '';
}
