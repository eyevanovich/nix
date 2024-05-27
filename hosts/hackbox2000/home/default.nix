{username, ...}: {
  # import sub modules
  imports = [
    ./core.nix
    ./programs
  ];

  # Home Manager needs a bit of information about you and the
  # paths it should manage.
  home = {
    username = username;
    homeDirectory = "/Users/${username}";

    # You can also manage environment variables but you will have to manually
    # source
    #
    #  ~/.nix-profile/etc/profile.d/hm-session-vars.sh
    #
    # or
    #
    #  /etc/profiles/per-user/davish/etc/profile.d/hm-session-vars.sh
    #
    # if you don't want to manage your shell through Home Manager.
    sessionVariables = {
      EDITOR = "hx";
    };
  };

  # Let Home Manager install and manage itself.
  programs.home-manager.enable = true;
}
