{pkgs, ...}: {
  programs.helix = {
    enable = true;
    defaultEditor = true;
    extraPackages = [
      pkgs.marksman
      pkgs.taplo
      pkgs.typos-lsp
      pkgs.nil
      pkgs.vscode-langservers-extracted
      pkgs.nixpkgs-fmt
      pkgs.yaml-language-server
      pkgs.gopls
    ];
  };
  home.file.".config/helix" = {
    source = ../../../../dotfiles/helix;
    recursive = true;
  };
}
