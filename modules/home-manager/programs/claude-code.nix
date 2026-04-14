{
  config,
  profile,
  lib,
  ...
}: {
  home.file.".claude/settings.local.json" = lib.mkIf (profile == "personal") {
    source =
      config.lib.file.mkOutOfStoreSymlink
      "${config.xdg.configHome}/nix/dotfiles/claude-code/settings.local.json";
  };
}
