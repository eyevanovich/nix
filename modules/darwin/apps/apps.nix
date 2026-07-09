{
  pkgs,
  lib,
  profile,
  username,
  hostname,
  ...
}: let
  trustedHomebrewTaps =
    ["gentleman-programming/tap"]
    ++ lib.optionals (profile == "work") ["messense/macos-cross-toolchains" "skyhook-io/tap"];
in {
  environment.variables.HOMEBREW_NO_ANALYTICS = "1";
  environment.variables.EDITOR = "hx";

  # Homebrew 5.1+ requires explicit trust for non-official taps before it will
  # load their formulae during `brew bundle`. nix-homebrew sets up declarative
  # taps in this activation script; append trust commands after tap setup and
  # before nix-darwin runs Homebrew Bundle.
  system.activationScripts.setup-homebrew.text = lib.mkAfter ''
    if [ -x /opt/homebrew/bin/brew ]; then
      sudo \
        --user=${lib.escapeShellArg username} \
        --set-home \
        env HOMEBREW_DEVELOPER=1 \
        /opt/homebrew/bin/brew trust --tap ${lib.concatMapStringsSep " " lib.escapeShellArg trustedHomebrewTaps}
    fi
  '';

  system.activationScripts.postActivation.text = lib.mkAfter ''
    if [ -x /opt/homebrew/bin/engram ]; then
      sudo \
        --user=${lib.escapeShellArg username} \
        --set-home \
        env PATH="${pkgs.git}/bin:${pkgs.nodejs}/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin" \
        /opt/homebrew/bin/engram setup pi || \
        echo "warning: failed to run engram setup pi"
    fi
  '';

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
      # Homebrew Bundle removed the `brew bundle --cleanup` switch that nix-darwin
      # still emits for cleanup = "uninstall"/"zap". Keep activation cleanup
      # disabled until nix-darwin migrates to `brew bundle cleanup --force`.
      cleanup = "none";
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
    masApps =
      {
        "Notability: Smarter AI Notes" = 360593530;
        "Tailscale" = 1475387142;
        "Pixelmator Pro" = 1289583905;
        "SnippetsLab" = 1006087419;
        "Boop" = 1518425043;
      }
      // lib.optionalAttrs (profile == "personal") {
        "Pages" = 361309726;
        "Mattermost Desktop" = 1614666244;
      }
      // lib.optionalAttrs (hostname == "hackbox-air") {
        "Amphetamine" = 937984704;
      };

    taps =
      [
        "gentleman-programming/tap"
      ]
      ++ lib.optionals (profile == "work") [
        "messense/macos-cross-toolchains"
        "skyhook-io/tap"
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
      ];

    # `brew install --cask`
    casks =
      [
        "1password"
        "1password-cli"
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
        "codex"
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
        "imazing-profile-editor"
        "cursor"
        "openlens"
        "skyhook-io/tap/radar-desktop"
      ];
  };
}
