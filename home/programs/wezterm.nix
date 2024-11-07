{...}: {
  programs.wezterm = {
    enable = true;
  };

  home.file.".config/wezterm" = {
    source = ../../dotfiles/wezterm;
    recursive = true;
  };
}
