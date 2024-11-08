{config, ...}: {
  home.file.".config/sketchybar/plugins" = {
    source = "${config.xdg.configHome}/nix/dotfiles/sketchybar/plugins";
    recursive = true;
  };

  ## Make config mutable with mkOutOfStoreSymlink (note: needs absolute path to file)
  home.file.".config/sketchybar/sketchybarrc".source = config.lib.file.mkOutOfStoreSymlink "${config.xdg.configHome}/nix/dotfiles/sketchybar/sketchybarrc";
}
