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
    # Import host configurations
    hosts = import ./hosts;

    # Function to create a Darwin configuration for a specific host
    mkDarwinConfig = {
      hostname,
      username,
      system,
    }:
      darwin.lib.darwinSystem {
        inherit system;
        specialArgs = inputs // {inherit username hostname;};
        modules = [
          # nix-homebrew
          nix-homebrew.darwinModules.nix-homebrew
          {
            nix-homebrew = {
              enable = true;
              enableRosetta = true;
              user = username;
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
              extraSpecialArgs = inputs // {inherit username hostname;};
              backupFileExtension = "nixbackup";
              users.${username} = import ./modules/home-manager;
            };
          }
        ];
      };

    # Generate configurations for all hosts
    darwinConfigurations =
      builtins.mapAttrs
      (hostname: hostConfig:
        mkDarwinConfig {
          inherit hostname;
          username = hostConfig.username;
          system = hostConfig.system;
        })
      hosts;

    # Define default system for formatter
    defaultSystem = "aarch64-darwin";
  in {
    config.nix.channel.enable = false;
    inherit darwinConfigurations;

    # nix code formatter
    formatter.${defaultSystem} = nixpkgs.legacyPackages.${defaultSystem}.alejandra;
  };
}
