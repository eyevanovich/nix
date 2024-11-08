{username, ...}: {
  # import sub modules
  imports = [
    ./core.nix
  ];

  # Home Manager needs a bit of information about you.
  home = {
    username = username;
    homeDirectory = "/Users/${username}";
    sessionVariables = {
      EDITOR = "hx";
      VISUAL = "hx";
    };
  };

  # Let Home Manager install and manage itself.
  programs.home-manager.enable = true;
}
