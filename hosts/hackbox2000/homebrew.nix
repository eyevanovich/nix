{ ... }:

homebrew = {
  # Enable Homebrew
  # Note that enabling this option does not install Homebrew, see the Homebrew website for installation instructions.
  # https://brew.sh/
  # https://daiderd.com/nix-darwin/manual/index.html#opt-homebrew.enable
  enable = true;

  # Automatically use the Brewfile that this module generates in the Nix store
  # https://daiderd.com/nix-darwin/manual/index.html#opt-homebrew.global.brewfile
  global.brewfile = true;

  taps = [
    "homebrew/cask-fonts"
    "homebrew/cask-versions"
    "homebrew/services"
    "oven-sh/bun"
  ];

  # List of Homebrew formulae to install.
  # https://daiderd.com/nix-darwin/manual/index.html#opt-homebrew.brews
  brews = [
    "awscli"
    "bat"
    "glow"
    "helix"
    "bottom"
    "jq"
    "lazygit"
    "zellij"
    "marksman"
    "neofetch"
    "pre-commit"
    "taplo"
    "yq"
    "fish"
    "tldr"
    "kubectx"
    "direnv"
    "yazi"
  ];

  # Prefer installing application from the Mac App Store
  #
  # Commented apps suffer continual update issue:
  # https://github.com/malob/nixpkgs/issues/9
  masApps = {
    "Xcode" = 497799835;
  };


  # List of Homebrew casks to install.
  # https://daiderd.com/nix-darwin/manual/index.html#opt-homebrew.casks
  casks = [
    "arc"
    "karabiner-elements"
    "obsidian"
    "rectangle"
    "spotify"
    "setapp"
  ];
}
