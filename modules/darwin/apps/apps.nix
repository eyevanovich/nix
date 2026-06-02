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
      # Homebrew Bundle now requires explicit confirmation for cleanup;
      # --force-cleanup makes `brew bundle --cleanup` non-interactive during activation.
      extraFlags = ["--force-cleanup"];
      # Homebrew 5.1+ (brew PR #20414) sets HOMEBREW_FORBID_PACKAGES_FROM_PATHS=true
      # unless HOMEBREW_DEVELOPER is set, and rejects any formula/cask whose realpath
      # escapes the prefix. nix-homebrew symlinks the whole Taps/ dir into /nix/store,
      # so every formula realpaths to /nix/store/...-source and gets rejected
      # ("Homebrew requires formulae to be in a tap, rejecting"). The internal opt-out
      # HOMEBREW_INTERNAL_ALLOW_PACKAGES_FROM_PATHS is unset by brew.sh, so set
      # HOMEBREW_DEVELOPER instead. Remove once nix-homebrew handles this upstream.
      extraEnv = {
        HOMEBREW_DEVELOPER = "1";
      };
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
      [
        "gentleman-programming/tap"
      ]
      ++ lib.optionals (profile == "work") [
        "messense/macos-cross-toolchains"
      ]
      ++ lib.optionals (profile == "personal") [
        "jundot/omlx"
      ];

    # `brew install`
    brews =
      [
        "beads"
        "codanna"
        "pi-coding-agent"
        "gentleman-programming/tap/engram"
      ]
      ++ lib.optionals (profile == "work") [
        "messense/macos-cross-toolchains/aarch64-unknown-linux-gnu"
        "xmlstarlet"
        "awscli-local"
      ]
      ++ lib.optionals (profile == "personal") [
        {
          name = "jundot/omlx/omlx";
          start_service = true;
        }
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
        "hex-fiend"
        "quakenotch"
        "fastmail"
        "megasync"
        "mountain-duck"
        "jump-desktop"
        "docker/tap/sbx"
        "suspicious-package"
        "claude"
        "claude-code@latest"
        "zed"
      ]
      ++ lib.optionals (profile == "personal") [
        "steam"
        "splice"
        "private-internet-access"
        "lm-studio"
        "signal"
        "telegram"
        "termius"
      ]
      ++ lib.optionals (profile == "work") [
        "gcloud-cli"
        "packages"
        "jetbrains-toolbox"
        "imazing-profile-editor"
        "cursor"
        "openlens"
        "radar-desktop"
      ];
  };
}
