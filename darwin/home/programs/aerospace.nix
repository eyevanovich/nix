{...}: {
  home.file.".config/aerospace" = {
    source = ../../../../dotfiles/aerospace;
    recursive = true;
  };
}
