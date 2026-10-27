{config, ...}: {
  home.file.".config/rex/init.lua" = {
    source = "${config.xdg.configHome}/nix/dotfiles/rex/init.lua";
    force = true;
  };
}
