{
  lib,
  pkgs,
  ...
}: let
  ghostty-mock = pkgs.writeShellScriptBin "gostty-mock" ''
    true
  '';
in {
  programs.ghostty = lib.mkIf pkgs.stdenv.hostPlatform.isDarwin {
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
