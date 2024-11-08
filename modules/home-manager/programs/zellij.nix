{config, ...}: {
  programs.zellij = {
    enable = true;
  };
  home.file.".config/zellij" = {
    source = "${config.xdg.configHome}/nix/dotfiles/zellij";
    recursive = true;
  };
}
