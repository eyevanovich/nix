{pkgs, ...}: let
  ghostty-mock = pkgs.writeShellScriptBin "gostty-mock" ''
    true
  '';
in {
  programs.ghostty = {
    package = ghostty-mock;
    enable = true;
    enableFishIntegration = true;
    installBatSyntax = false;
    settings = {
      theme = "Catppuccin Macchiato";
      font-size = 13;
      font-family = "FiraCode Nerd Font Mono";
      macos-titlebar-style = "tabs";
    };
  };
}
