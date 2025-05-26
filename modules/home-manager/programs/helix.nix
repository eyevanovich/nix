{
  pkgs,
  config,
  ...
}: {
  programs.helix = {
    enable = true;
    defaultEditor = true;
    extraPackages = [
      pkgs.marksman
      pkgs.taplo
      pkgs.typos-lsp
      pkgs.nil
      pkgs.vscode-langservers-extracted
      pkgs.nodePackages.typescript-language-server
      pkgs.nodePackages.bash-language-server
      pkgs.dockerfile-language-server-nodejs
      pkgs.terraform-ls
      pkgs.nixpkgs-fmt
      pkgs.yaml-language-server
      pkgs.gopls
      pkgs.nixd
    ];
  };

  ## Make config mutable with mkOutOfStoreSymlink (note: needs absolute path to file)
  home.file.".config/helix/config.toml".source = config.lib.file.mkOutOfStoreSymlink "${config.xdg.configHome}/nix/dotfiles/helix/config.toml";
  home.file.".config/helix/languages.toml".source = config.lib.file.mkOutOfStoreSymlink "${config.xdg.configHome}/nix/dotfiles/helix/languages.toml";
}
