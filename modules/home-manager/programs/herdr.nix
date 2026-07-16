{config, ...}: {
  home.file.".config/herdr/config.toml".source = "${config.xdg.configHome}/nix/dotfiles/herdr/config.toml";
}
