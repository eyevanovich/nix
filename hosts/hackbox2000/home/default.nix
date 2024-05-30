{username, ...}: {
  # import sub modules
  imports = [
    ./core.nix
  ];

  # Home Manager needs a bit of information about you and the
  # paths it should manage.
  home = {
    # This value determines the home Manager release that your
    # configuration is compatible with. This helps avoid breakage
    # when a new home Manager release introduces backwards
    # incompatible changes.
    #
    # You can update home Manager without changing this value. See
    # the home Manager release notes for a list of state version
    # changes in each release.
    stateVersion = "23.11";
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
