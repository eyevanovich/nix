{
  pkgs,
  username,
  ...
}: {
  # import sub modules
  imports = [
    ./core.nix
  ];

  # Home Manager needs a bit of information about you.
  home = {
    username = username;
    homeDirectory =
      if pkgs.stdenv.hostPlatform.isDarwin
      then "/Users/${username}"
      else "/home/${username}";
    sessionVariables = {
      EDITOR = "hx";
      VISUAL = "hx";
    };
  };

  # Let Home Manager install and manage itself.
  programs.home-manager.enable = true;
}
