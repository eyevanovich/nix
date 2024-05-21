{
  description = "ipiesh flake";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-23.11";
    home-manager.url = "github:nix-community/home-manager/release-23.11";
    home-manager.inputs.nixpkgs.follows = "nixpkgs";

    nixpkgs-darwin.url = "github:NixOS/nixpkgs/nixpkgs-23.11-darwin";
    darwin.url = "github:LnL7/nix-darwin/master";
    darwin.inputs.nixpkgs.follows = "nixpkgs-darwin";
  };

  outputs = { self, nixpkgs, nixpkgs-darwin, darwin, home-manager }: {
    darwinConfigurations."hackbox2000" = darwin.lib.darwinSystem {
      system = "aarch64-darwin";
      modules = [
        # Main `nix-darwin` configuration
        ./hosts/hackbox2000/default.nix

        # Homebrew configuration
        ./hosts/hackbox2000/homebrew.nix

        # The flake-based setup of the Home Manager `nix-darwin` module
        home-manager.darwinModules.home-manager
          {
            home-manager.useGlobalPkgs = true;
            home-manager.useUserPackages = true;
          }
      ];
    };

    # Set Nix formatter
    # https://nixos.org/manual/nix/unstable/command-ref/new-cli/nix3-fmt#examples
    formatter.aarch64-darwin = nixpkgs.legacyPackages.aarch64-darwin.nixpkgs-fmt;
  };
}
