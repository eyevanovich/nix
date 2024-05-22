{
  description = "macOS configurator";

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

  outputs = inputs @ {
    self,
    nixpkgs,
    nix-darwin,
    home-manager,
    ...
  }: let
    username = "ipiesh";
    useremail = "macos@ivanpiesh.info";
    system = "aarch64-darwin"; # aarch64-darwin or x86_64-darwin
    hostname = "hackbox2000";
    specialArgs =
      inputs
      // {
        inherit username useremail hostname;
      };
  in {
    darwinConfigurations."${hostname}" = nix-darwin.lib.darwinSystem {
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
        }
      ];
    };

    # nix code formatter
    formatter.${system} = nixpkgs.legacyPackages.${system}.alejandra;
  };
}

