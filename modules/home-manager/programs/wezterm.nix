{
  config,
  pkgs,
  ...
}: let
  wezterm-terminfo =
    pkgs.runCommand "wezterm-terminfo" {
      nativeBuildInputs = [pkgs.ncurses];
    } ''
      mkdir -p $out/share/terminfo
      tic -x -o $out/share/terminfo ${pkgs.fetchurl {
        url = "https://raw.githubusercontent.com/wezterm/wezterm/main/termwiz/data/wezterm.terminfo";
        hash = "sha256-XjhvsUmyoWtxtNmjc8VHN8nlaU62f+ONk7JHBbk0N+0=";
      }}
    '';
in {
  programs.wezterm = {
    enable = true;
  };

  home.file.".config/wezterm" = {
    source = "${config.xdg.configHome}/nix/dotfiles/wezterm";
    recursive = true;
  };

  home.file.".terminfo" = {
    source = "${wezterm-terminfo}/share/terminfo";
    recursive = true;
  };
}
