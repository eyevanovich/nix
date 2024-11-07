{...}: {
  programs.zellij = {
    enable = true;
  };
  home.file.".config/zellij" = {
    source = ../../dotfiles/zellij;
    recursive = true;
  };
}
