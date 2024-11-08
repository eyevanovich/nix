{config, ...}: {
  home.file.".config/karabiner" = {
    source = "${config.xdg.configHome}/nix/dotfiles/karabiner";
    recursive = true;
  };
}
