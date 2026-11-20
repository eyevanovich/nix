{...}: {
  programs.carapace = {
    enable = true;
    enableFishIntegration = true;
  };

  home.sessionVariables = {
    CARAPACE_BRIDGES = "fish,zsh,bash,inshellisense";
    CARAPACE_MATCH = "CASE_INSENSITIVE";
  };
}
