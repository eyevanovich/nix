{
  pkgs,
  lib,
  profile,
  ...
}: {
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
      autoUpdate = true;
      upgrade = true;
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
      "SnippetsLab" = 1006087419;
      "Boop" = 1518425043;
    };

    taps =
      lib.optionals (profile == "work") [
        "messense/macos-cross-toolchains"
      ]
      ++ lib.optionals (profile == "personal") [
        "gentleman-programming/tap"
      ];

    # `brew install`
    brews =
      [
        "beads"
        "codanna"
      ]
      ++ lib.optionals (profile == "work") [
        "messense/macos-cross-toolchains/aarch64-unknown-linux-gnu"
        "xmlstarlet"
        "awscli-local"
      ]
      ++ lib.optionals (profile == "personal") [
        "gentleman-programming/tap/engram"
      ];

    # `brew install --cask`
    casks =
      [
        "1password"
        "1password-cli"
        "headlamp"
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
        "mac-mouse-fix"
        "arq"
        "zen"
        "google-chrome"
        "odrive"
        "the-unarchiver"
        "secretive"
        "utm"
        "postman"
        "redis-insight"
        "claude"
        "claude-code@latest"
        "hex-fiend"
        "quakenotch"
        "fastmail"
        "megasync"
        "mountain-duck"
        "jump-desktop"
        "suspicious-package"
      ]
      ++ lib.optionals (profile == "personal") [
        "steam"
        "splice"
        "private-internet-access"
        "lm-studio"
        "signal"
        "termius"
      ]
      ++ lib.optionals (profile == "work") [
        "packages"
        "jetbrains-toolbox"
        "imazing-profile-editor"
        "cursor"
        "openlens"
      ];
  };
}
