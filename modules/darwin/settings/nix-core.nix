{pkgs, ...}: {
  # enable flakes globally
  nix.settings.experimental-features = ["nix-command" "flakes"];

  # Allow unfree packages
  nixpkgs.config.allowUnfree = true;

  # Disable channels — we use flakes exclusively
  nix.channel.enable = false;

  # Set this to false since determinite systems nix will manage it for us
  nix.enable = false;

  nix.package = pkgs.nix;

  # Disable auto-optimise-store because of this issue:
  #   https://github.com/NixOS/nix/issues/7273
  # "error: cannot link '/nix/store/.tmp-link-xxxxx-xxxxx' to '/nix/store/.links/xxxx': File exists"
  nix.settings = {
    auto-optimise-store = false;
    download-buffer-size = 268435456; # 256 MB
  };

  # Used for backwards compatibility. please read the changelog
  # before changing: `darwin-rebuild changelog`.
  system.stateVersion = 4;
}
