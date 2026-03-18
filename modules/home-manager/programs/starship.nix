{config, ...}: {
  programs.starship = {
    enable = true;
    enableFishIntegration = true;
    enableNushellIntegration = true;
  };

  home.file.".config/starship" = {
    source = "${config.xdg.configHome}/nix/dotfiles/starship";
    recursive = true;
  };
}
