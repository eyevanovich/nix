{...}: {
  programs.starship = {
    enable = true;
    enableFishIntegration = true;
  };

  home.file.".config/starship" = {
    source = ../../../dotfiles/starship;
    recursive = true;
  };
}
