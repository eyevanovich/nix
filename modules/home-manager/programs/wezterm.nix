{config, ...}: {
  programs.wezterm = {
    enable = true;
  };

  home.file.".config/wezterm" = {
    source = "${config.xdg.configHome}/nix/dotfiles/wezterm";
    recursive = true;
  };
}
