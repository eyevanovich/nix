{pkgs, ...}: {
  environment.variables.HOMEBREW_NO_ANALYTICS = "1";
  environment.variables.EDITOR = "hx";

  ##########################################################################
  #
  #  Install all apps and packages here.
  #
  #  NOTE: Your can find all available options in:
  #    https://daiderd.com/nix-darwin/manual/index.html
  #
  #
  ##########################################################################

  # Install packages from nix's official package repository.
  #
  # The packages installed here are available to all users, and are reproducible across machines, and are rollbackable.
  # But on macOS, it's less stable than homebrew.
  #
  # Related Discussion: https://discourse.nixos.org/t/darwin-again/29331
  environment.systemPackages = with pkgs; [
    git
  ];

  homebrew = {
    enable = true;

    onActivation = {
      autoUpdate = false;
      # 'zap': uninstalls all formulae(and related files) not listed here.
      cleanup = "zap";
    };

    # Applications to install from Mac App Store using mas.
    # You need to install all these Apps manually first so that your apple account have records for them.
    # otherwise Apple Store will refuse to install them.
    # For details, see https://github.com/mas-cli/mas
    masApps = {
      "Notability: Smarter AI Notes" = 360593530;
      "Tailscale" = 1475387142;
      "Pixelmator Pro" = 1289583905;
    };

    taps = [
    ];

    # `brew install`
    brews = [
    ];

    # `brew install --cask`
    casks = [
      "1password"
      "1password-cli"
      "openlens"
      "arc"
      "orion"
      "easyfind"
      "orbstack"
      "raycast"
      "obsidian"
      "tidal"
      "font-hack-nerd-font"
      "setapp"
      "betterdisplay"
      "flux-app"
      "karabiner-elements"
      "wezterm"
      "ghostty"
      "mac-mouse-fix"
      "arq"
      "lm-studio"
      "anythingllm"
      "odrive"
      "private-internet-access"
      "signal"
      "splice"
      "steam"
      "the-unarchiver"
      "utm"
    ];
  };
}
