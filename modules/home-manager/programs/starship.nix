{config, ...}: {
  programs.starship = {
    enable = true;
    enableFishIntegration = true;
  };

  home.file.".config/starship" = {
    source = "${config.xdg.configHome}/nix/dotfiles/starship";
    recursive = true;
  };
}
