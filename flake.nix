{
  description = "macOS configurator";

  inputs = {
    # the source of the nixpkgs input
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

    # adds the nix-darwin flake as an input
    darwin = {
      url = "github:LnL7/nix-darwin";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    # adds the home-manager flake as an input
    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  # defines the outputs of the flake, making the inputs
  # (self, nixpkgs, darwin, home-manager, etc.) available for use
  outputs = inputs @ {
    self,
    nixpkgs,
    darwin,
    home-manager,
    ...
  }: let
    # variables are defined for use in the configuration
    username = "ipiesh";
    useremail = "macos@ivanpiesh.info";
    system = "aarch64-darwin"; # aarch64-darwin or x86_64-darwin
    hostname = "hackbox2000";
    specialArgs =
      # includes all the inputs plus the additional variables
      inputs
      // {
        # `//` operator is used to merge two attribute sets
        inherit username useremail hostname;
      };
  in {
    darwinConfigurations."${hostname}" = darwin.lib.darwinSystem {
      inherit system specialArgs;
      modules = [
        ./hosts/hackbox2000/modules/nix-core.nix
        ./hosts/hackbox2000/modules/apps.nix
        ./hosts/hackbox2000/modules/system.nix
        ./hosts/hackbox2000/modules/host-users.nix

        # home manager
        home-manager.darwinModules.home-manager
        {
          home-manager.useGlobalPkgs = true;
          home-manager.useUserPackages = true;
          home-manager.extraSpecialArgs = specialArgs;
          home-manager.users.${username} = import ./hosts/hackbox2000/home/core.nix;
          home-manager.backupFileExtension = "backup";
        }
      ];
    };

    # nix code formatter
    formatter.${system} = nixpkgs.legacyPackages.${system}.alejandra;
  };
}
