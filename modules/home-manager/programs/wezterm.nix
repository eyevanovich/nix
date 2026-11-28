{
  lib,
  pkgs,
  ...
}: let
  wezterm-terminfo =
    pkgs.runCommand "wezterm-terminfo" {
      nativeBuildInputs = [pkgs.ncurses];
    } ''
      mkdir -p $out/share/terminfo
      tic -x -o $out/share/terminfo ${pkgs.fetchurl {
        url = "https://raw.githubusercontent.com/wezterm/wezterm/52c3515037518b826f32609179383948217d5a33/termwiz/data/wezterm.terminfo";
        hash = "sha256-XjhvsUmyoWtxtNmjc8VHN8nlaU62f+ONk7JHBbk0N+0=";
      }}
    '';
in {
  config = lib.mkIf pkgs.stdenv.hostPlatform.isDarwin {
    programs.wezterm = {
      enable = true;
    };

    home.file.".config/wezterm" = {
      source = ../../../dotfiles/wezterm;
      recursive = true;
    };

    home.file.".terminfo" = {
      source = "${wezterm-terminfo}/share/terminfo";
      recursive = true;
    };
  };
}
