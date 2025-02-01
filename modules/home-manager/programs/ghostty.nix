{pkgs,...}: 
let
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
      theme = "catppuccin-mocha";
      font-size = 10;
      font-family = "FiraCode Nerd Font Mono";
    };
  };
}

