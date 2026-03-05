# nix-darwin + home-manager config

macOS declarative configuration using nix-darwin, home-manager, and nix-homebrew.

## Build Commands (via `task`)

| Command | Description |
|---|---|
| `task rebuild` | Rebuild current host (uses `scutil --get LocalHostName`); pass hostname as arg to target another |
| `task build` | First-pass build using `nix run nix-darwin` (for fresh machines without darwin-rebuild) |
| `task fmt` | Format all Nix files with alejandra (`nix fmt .`) |
| `task update` | Update `flake.lock` (`nix flake update`) |
| `task garbage` | Wipe system profiles older than 7 days and GC unused store entries |
| `task darwin-debug` | Verbose trace build + switch, useful for diagnosing failures |
| `task clean` | Remove `./result` symlink |
| `task history` | Show nix system profile generations |

## Architecture

```
flake.nix          # Flake inputs + mkDarwinConfig builder + darwinConfigurations output
hosts.nix          # Per-host settings: system arch, profile, uid
overlays/          # nixpkgs overlays (currently pins localstack to a stable rev)
modules/
  darwin/          # nix-darwin system-level config
    apps/          # Homebrew casks/brews/masApps + system packages
    services/      # aerospace (window manager), borders
    settings/      # nix-core, system preferences, host-users
  home-manager/    # Home Manager user-level config
    core.nix       # home.packages — all CLI tools and dev packages
    programs/      # Per-program modules (helix, fish, git, wezterm, zellij, etc.)
dotfiles/          # Mutable config files symlinked from home-manager modules
```

## Key Patterns

### Profile Conditionals
Hosts declare `profile = "personal"` or `profile = "work"`. Use `lib.optionals` to gate
packages/casks on profile:
```nix
casks = [ "shared-app" ]
  ++ lib.optionals (profile == "personal") [ "steam" "splice" ]
  ++ lib.optionals (profile == "work") [ "cursor" ];
```
The `profile` arg flows from `hosts.nix` → `flake.nix` → `specialArgs`/`extraSpecialArgs`
into every module via the function argument.

### Dotfile Management — Mutable Symlinks
For configs that need live editing (helix, wezterm, etc.), use `mkOutOfStoreSymlink` so the
symlink points back into this repo rather than into the read-only Nix store:
```nix
home.file.".config/helix/config.toml".source =
  config.lib.file.mkOutOfStoreSymlink
    "${config.xdg.configHome}/nix/dotfiles/helix/config.toml";
```
Editing `dotfiles/helix/config.toml` takes effect immediately without a rebuild.

For configs fully managed by home-manager options (git, starship, etc.), use the standard
`programs.<name>.settings` / inline config approach (files end up in the Nix store).

### Overlays
Defined in `overlays/default.nix` and applied in `flake.nix` via
`nixpkgs.overlays = import ./overlays { inherit inputs; }`.
Currently used to pin `localstack` to a specific nixpkgs rev where its tests pass.

### Adding a New Host
1. Add an entry to `hosts.nix` with `system`, `profile`, and `uid`.
2. Run `task rebuild <hostname>` or `task build` on the new machine.

### Special Args Available in All Modules
`username`, `hostname`, `profile`, `uid` — passed via `specialArgs` (darwin) and
`extraSpecialArgs` (home-manager).
