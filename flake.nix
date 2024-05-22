{
  description = "ipiesh flake";

  inputs = {
     nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

     nix-darwin = {
        url = "github:LnL7/nix-darwin";
        inputs.nixpkgs.follows = "nixpkgs";
    };

    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, nix-darwin, home-manager }: {
    darwinConfigurations."hackbox2000" = nix-darwin.lib.darwinSystem {
      system = "aarch64-darwin";
      modules = [
        ./hosts/hackbox2000/default.nix
        ./hosts/hackbox2000/homebrew.nix

        # The flake-based setup of the Home Manager `nix-darwin` module
        home-manager.darwinModules.home-manager
          {
            home-manager.useGlobalPkgs = true;
            home-manager.useUserPackages = true;
            home-manager.users.ipiesh = import ./hosts/hackbox2000/home.nix;
          }
      ];
    };
  };
}
