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

    # homebrew
    nix-homebrew = {
      url = "github:zhaofengli-wip/nix-homebrew";
    };
    homebrew-core = {
      url = "github:homebrew/homebrew-core";
      flake = false;
    };
    homebrew-cask = {
      url = "github:homebrew/homebrew-cask";
      flake = false;
    };
    homebrew-bundle = {
      url = "github:homebrew/homebrew-bundle";
      flake = false;
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
    homebrew-core,
    homebrew-cask,
    homebrew-bundle,
    nix-homebrew,
    scls,
    ...
  }: let
    # variables are defined for use in the configuration
    username = "ipiesh";
    hostname = "hackbox2000";
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
        # nix-homebrew
        nix-homebrew.darwinModules.nix-homebrew
        {
          nix-homebrew = {
            enable = true;
            enableRosetta = true;
            user = "ipiesh";
            # Optional: Enable fully-declarative tap management
            #
            # With mutableTaps disabled, taps can no longer be added imperatively with `brew tap`.
            mutableTaps = false;
            # Optional: Declarative tap management
            taps = {
              "homebrew/homebrew-core" = homebrew-core;
              "homebrew/homebrew-cask" = homebrew-cask;
              "homebrew/homebrew-bundle" = homebrew-bundle;
            };
          };
        }

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
