{config, ...}: {
  home.file.".config/sketchybar" = {
    source = "${config.xdg.configHome}/nix/dotfiles/sketchybar";
    recursive = true;
  };
}
