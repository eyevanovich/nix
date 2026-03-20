{...}: {
  programs.carapace = {
    enable = true;
    enableFishIntegration = true;
    enableNushellIntegration = true;
  };

  home.sessionVariables = {
    CARAPACE_BRIDGES = "fish,zsh,bash,inshellisense";
    CARAPACE_MATCH = "CASE_INSENSITIVE";
  };

}
