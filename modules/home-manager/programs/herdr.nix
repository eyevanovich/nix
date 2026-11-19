{...}: {
  home.file.".config/herdr/config.toml" = {
    source = ../../../dotfiles/herdr/config.toml;
    force = true;
  };
}
