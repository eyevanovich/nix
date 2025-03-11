# dotfiles-nix

A declarative macOS setup using Nix, nix-darwin, and home-manager

## Overview

This repository contains a complete, declarative configuration for macOS systems using:
- [Nix](https://nixos.org/) - The purely functional package manager
- [nix-darwin](https://github.com/LnL7/nix-darwin) - For macOS system configuration
- [home-manager](https://github.com/nix-community/home-manager) - For user environment configuration
- [Homebrew](https://brew.sh/) (via nix-homebrew) - For packages not available in Nixpkgs

## Provisioning a New macOS Machine

### 1. Set Hostname

Set the hostname of your machine:

```bash
sudo scutil --set ComputerName YourComputerName
sudo scutil --set HostName YourHostName
sudo scutil --set LocalHostName YourLocalHostName
```

### 2. Create Admin User

Create an admin user and log in.

### 3. Install Nix

Install Nix using the Determinate Systems installer:

```bash
curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | \
  sh -s -- install --determinate
```

### 4. Clone Repository

Clone this repository to your configuration directory:

```bash
git clone https://github.com/eyevanovich/nix.git ~/.config/nix && cd ~/.config/nix
```

### 5. Configure Your Host

Edit the `hosts.nix` file to add your machine's hostname and system architecture. The default username is set to "ipiesh", but you can override it for specific machines if needed.

### 6. Initial Setup

#### First Run

For the first time setup, run:

```bash
nix run nix-darwin --extra-experimental-features nix-command --extra-experimental-features flakes -- switch --flake ~/.config/nix --impure
```

#### Subsequent Updates

After the initial setup, you can use the included Taskfile:

```bash
# First time using Task
task build

# For subsequent rebuilds
task rebuild
```

### 7. Additional Setup

#### Wezterm Terminfo Installation

To properly configure Wezterm terminal:

```bash
# Run in bash shell
tempfile=$(mktemp) \
  && curl -o $tempfile https://raw.githubusercontent.com/wezterm/wezterm/main/termwiz/data/wezterm.terminfo \
  && tic -x -o ~/.terminfo $tempfile \
  && rm $tempfile
```

## Structure

- `flake.nix` - The main entry point for the Nix configuration
- `hosts.nix` - Host-specific configurations
- `modules/` - Configuration modules
  - `darwin/` - macOS system configuration
  - `home-manager/` - User environment configuration

## References

- [Managing dotfiles with home-manager](https://alex.pearwin.com/2021/07/managing-dotfiles-with-nix/)
- [home-manager module/programs reference](https://github.com/nix-community/home-manager/tree/master/modules/programs)
- [nix-darwin-kickstarter](https://github.com/ryan4yin/nix-darwin-kickstarter/tree/main)
