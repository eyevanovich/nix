{
  lib,
  pkgs,
  ...
}: {
  home.file = lib.mkIf pkgs.stdenv.hostPlatform.isDarwin {
    ".config/karabiner" = {
      source = ../../../dotfiles/karabiner;
      recursive = true;
    };
  };
}
