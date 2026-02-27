# dotfiles-nix

A declarative macOS setup using Nix, nix-darwin, and home-manager.

## Overview

This repository contains a complete, declarative configuration for macOS systems using:
- [Nix](https://nixos.org/) - The purely functional package manager
- [nix-darwin](https://github.com/LnL7/nix-darwin) - For macOS system configuration
- [home-manager](https://github.com/nix-community/home-manager) - For user environment configuration
- [Homebrew](https://brew.sh/) (via [nix-homebrew](https://github.com/zhaofengli-wip/nix-homebrew)) - For packages not available in Nixpkgs

### Profiles

Every host is assigned a **profile** (`personal` or `work`) in `hosts.nix`. Profiles control which apps, packages, and settings are installed. For example, work machines get Slack and Docker Desktop while personal machines get Steam and IINA. See `modules/darwin/apps/apps.nix` for the full breakdown.

## Provisioning a New Machine

### 1. Set Hostname

```bash
sudo scutil --set ComputerName YourComputerName
sudo scutil --set HostName YourHostName
sudo scutil --set LocalHostName YourLocalHostName
```

### 2. Create Admin User

Create an admin user and log in.

### 3. Install Nix

Install Nix using the [Determinate Systems installer](https://github.com/DeterminateSystems/nix-installer):

```bash
curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | \
  sh -s -- install --determinate
```

Open a new terminal (or run `exec $SHELL`) so that `nix` is on your path before continuing.

### 4. Clone Repository

```bash
git clone https://github.com/eyevanovich/nix.git ~/.config/nix && cd ~/.config/nix
```

### 5. Add Your Host

Edit `hosts.nix` and add an entry for your machine:

```nix
"YourLocalHostName" = {
  system = "aarch64-darwin";   # or "x86_64-darwin" for Intel
  profile = "personal";        # or "work"
  uid = 501;                   # run `id -u` to find yours
};
```

The hostname must match `scutil --get LocalHostName`. The default username (`ipiesh`) can be overridden per-host with `username = "someone-else";`. The `uid` must match your macOS user ID (`id -u`); most first-user setups are `501`.

### 6. First Build

Bootstrap `go-task` via nix-shell, then run the initial build:

```bash
nix-shell -p go-task --run 'task build'
```

### 7. Subsequent Rebuilds

After the first build, `task` is available on your path:

```bash
task rebuild
```

## Day-to-Day Commands

All common operations are exposed through the [Taskfile](https://taskfile.dev/):

| Command | Description |
|---|---|
| `task build` | First-pass build (downloads everything, bootstraps nix-darwin) |
| `task rebuild` | Rebuild after config changes (the command you'll use most) |
| `task update` | Update the flake lock file to pull latest dependencies |
| `task history` | View nix system generation history |
| `task garbage` | Remove generations older than 7 days and garbage-collect the store |
| `task fmt` | Format all nix files with alejandra |
| `task clean` | Remove the `./result` symlink |
| `task darwin-debug` | Debug build with `--show-trace --verbose` |

Both `build` and `rebuild` accept an optional hostname argument: `task rebuild -- hackbox2000`.

## Repository Structure

```
.
├── flake.nix                          # Flake entry point — inputs & host wiring
├── flake.lock
├── hosts.nix                          # Per-machine hostname, arch, and profile
├── Taskfile.yml                       # Day-to-day commands
│
├── modules/
│   ├── darwin/                        # macOS system-level config (nix-darwin)
│   │   ├── apps/
│   │   │   └── apps.nix              # Homebrew casks, formulae, and Mac App Store apps
│   │   ├── services/
│   │   │   ├── aerospace.nix         # Aerospace window manager
│   │   │   └── borders.nix          # Window borders
│   │   └── settings/
│   │       ├── host-users.nix        # User account setup
│   │       ├── nix-core.nix          # Nix daemon & store settings
│   │       └── system.nix            # macOS defaults (Dock, Finder, etc.)
│   │
│   └── home-manager/                  # User-level config (home-manager)
│       ├── core.nix                   # Nix packages installed via home.packages
│       └── programs/                  # Per-program modules
│           ├── bat.nix
│           ├── eza.nix
│           ├── fish.nix
│           ├── ghostty.nix
│           ├── git.nix
│           ├── helix.nix
│           ├── karabiner.nix
│           ├── sqls.nix
│           ├── starship.nix
│           ├── wezterm.nix
│           └── zellij.nix
│
├── dotfiles/                          # Raw config files symlinked by home-manager
│   ├── helix/
│   ├── karabiner/
│   ├── starship/
│   ├── wezterm/
│   ├── yazi/
│   └── zellij/
│
└── overlays/                          # Nixpkgs overlays (package overrides)
    └── default.nix
```

## How Things Work

### Adding Apps & Packages

- **Homebrew casks & formulae** — edit `modules/darwin/apps/apps.nix` under `homebrew.casks` or `homebrew.brews`
- **Mac App Store apps** — add to `homebrew.masApps` in the same file
- **Nix packages** — add to `home.packages` in `modules/home-manager/core.nix`
- **Profile-specific** — wrap items with `lib.optionals (profile == "work") [ ... ]` (see existing examples in `apps.nix`)

### Adding Dotfiles

1. Put your raw config files in `dotfiles/<app>/`
2. Create or edit a program module in `modules/home-manager/programs/`
3. Use `home.file` or `xdg.configFile` to symlink the files — see `modules/home-manager/programs/helix.nix` for an example

### Adding a New Host

1. Add an entry to `hosts.nix` (hostname, system, profile)
2. Run `task build` on the new machine

## Post-Install

### Wezterm Terminfo

To properly configure Wezterm terminal:

```bash
tempfile=$(mktemp) \
  && curl -o $tempfile https://raw.githubusercontent.com/wezterm/wezterm/main/termwiz/data/wezterm.terminfo \
  && tic -x -o ~/.terminfo $tempfile \
  && rm $tempfile
```

## References

- [Managing dotfiles with home-manager](https://alex.pearwin.com/2021/07/managing-dotfiles-with-nix/)
- [home-manager module/programs reference](https://github.com/nix-community/home-manager/tree/master/modules/programs)
- [nix-darwin-kickstarter](https://github.com/ryan4yin/nix-darwin-kickstarter/tree/main)
- [nix-homebrew](https://github.com/zhaofengli-wip/nix-homebrew)
