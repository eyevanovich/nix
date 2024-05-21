{
  description = "ipiesh flake";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-23.11";
    nixpkgs-darwin.url = "github:NixOS/nixpkgs/nixpkgs-23.11-darwin";

    darwin.url = "github:LnL7/nix-darwin/master";
    darwin.inputs.nixpkgs.follows = "nixpkgs-darwin";

    home-manager.url = "github:nix-community/home-manager/release-23.11";
    home-manager.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = { self, nixpkgs, darwin, home-manager }: {
    darwinConfigurations."hackbox2000" = darwin.lib.darwinSystem {
      system = "aarch64-darwin";
      modules = [
        # Main `nix-darwin` configuration
        ./hosts/hackbox2000/default.nix

        # Homebrew configuration
        # https://xyno.space/post/nix-darwin-introduction
        ./hosts/hackbox2000/homebrew.nix

        # The flake-based setup of the Home Manager `nix-darwin` module
        # https://nix-community.github.io/home-manager/index.html#sec-flakes-nix-darwin-module
        home-manager.darwinModules.home-manager
          {
            home-manager.useGlobalPkgs = true;
            home-manager.useUserPackages = true;
            home-manager.users.ipiesh = import ./home;

            # Optionally, use home-manager.extraSpecialArgs to pass
            # arguments to home.nix
          }
      ];
    };

    # Set Nix formatter
    # https://nixos.org/manual/nix/unstable/command-ref/new-cli/nix3-fmt#examples
    formatter.aarch64-darwin = nixpkgs.legacyPackages.aarch64-darwin.nixpkgs-fmt;
  };
}
