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

    # adds simple completion language flake as an input
    scls = {
      url = "github:estin/simple-completion-language-server";
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
    scls,
    ...
  }: let
    # variables are defined for use in the configuration
    username = "ipiesh";
    hostname = "WFH-DEV-IPIESH-TEST";
    system = "aarch64-darwin"; # aarch64-darwin or x86_64-darwin
    specialArgs =
      # includes all the inputs plus the additional variables
      inputs
      // {
        # `//` operator is used to merge two attribute sets
        inherit username hostname;
      };
  in {
    darwinConfigurations."${hostname}" = darwin.lib.darwinSystem {
      inherit system specialArgs;
      modules = [
        # nix-darwin
        ./modules/darwin

        # home manager
        home-manager.darwinModules.home-manager
        {
          home-manager = {
            useGlobalPkgs = true;
            useUserPackages = true;
            extraSpecialArgs = specialArgs;
            backupFileExtension = "nixbackup";
            users.${username} = import ./modules/home-manager;
          };
        }
      ];
    };

    # nix code formatter
    formatter.${system} = nixpkgs.legacyPackages.${system}.alejandra;
  };
}
