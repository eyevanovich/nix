{config, ...}: {
  ## Make config mutable with mkOutOfStoreSymlink (note: needs absolute path to file)
  home.file.".config/aerospace/aerospace.toml".source = config.lib.file.mkOutOfStoreSymlink "${config.xdg.configHome}/nix/dotfiles/aerospace/aerospace.toml";
}
