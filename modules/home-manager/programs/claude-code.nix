{
  config,
  profile,
  lib,
  pkgs,
  ...
}: let
  dotfiles = "${config.xdg.configHome}/nix/dotfiles/claude-code";
  claudeJson = "${config.home.homeDirectory}/.claude.json";
in {
  # settings.json — edit-in-place via out-of-store symlink (like helix)
  home.file.".claude/settings.json" = lib.mkIf (profile == "personal") {
    source =
      config.lib.file.mkOutOfStoreSymlink "${dotfiles}/settings.json";
  };

  # MCP servers — merged into ~/.claude.json on every rebuild
  home.activation.claudeMcpServers =
    lib.mkIf (profile == "personal")
    (lib.hm.dag.entryAfter ["writeBoundary"] ''
      if [ -f "${claudeJson}" ] && [ -f "${dotfiles}/mcp-servers.json" ]; then
        tmp=$(${pkgs.coreutils}/bin/mktemp)
        ${pkgs.jq}/bin/jq --slurpfile mcp "${dotfiles}/mcp-servers.json" \
          '.mcpServers = $mcp[0]' "${claudeJson}" > "$tmp" \
          && ${pkgs.coreutils}/bin/mv "$tmp" "${claudeJson}"
      fi
    '');
}
