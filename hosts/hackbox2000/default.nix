{ pkgs, ... }:
{
  nix.useDaemon = true;

  # Configure extra options: https://nix-community.github.io/home-manager/options.html#opt-nix.extraOptions
  # `auto-optimise-store` | Storage optimization: https://nixos.wiki/wiki/Storage_optimization
  # `experimental-features` | Enable flakes permanently: https://nixos.wiki/wiki/Flakes#Permanent
  # `extra-nix-path` | Temporary fix for `nix-shell`: https://github.com/DeterminateSystems/nix-installer/pull/270
  nix.extraOptions = ''
    auto-optimise-store = true
    experimental-features = nix-command flakes
    extra-nix-path = nixpkgs=flake:nixpkgs
  '';

  # Used for backwards compatibility. please read the changelog
  # before changing: `darwin-rebuild changelog`.
  system.stateVersion = 4;
        
  # macOS system defaults configuration
  # https://daiderd.com/nix-darwin/manual/index.html#opt-system.defaults.dock.autohide
  system.defaults.dock.autohide = true;

  # Explicitly set the home directory for the user.
  users.users.ipiesh.home = "/Users/ipiesh";

  environment.systemPackages = [ pkgs.neofetch ];
  environment.variables.HOMEBREW_NO_ANALYTICS = "1";

  programs.fish.enable = true; 

  # Fonts
  fonts = {
    fontDir.enable = true;
    fonts = with pkgs; [
      fira
      fira-code
      fira-code-symbols
      (nerdfonts.override { fonts = [ "JetBrainsMono" "FiraCode" "Hack" ]; })
    ];
  };
}

