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

### Dotfile Management — Two Approaches

**`mkOutOfStoreSymlink` (helix only):** Symlinks point back into this repo — edits take
effect immediately, no rebuild needed:
```nix
home.file.".config/helix/config.toml".source =
  config.lib.file.mkOutOfStoreSymlink
    "${config.xdg.configHome}/nix/dotfiles/helix/config.toml";
```

**Plain `source` with `recursive = true` (wezterm, zellij, karabiner, starship):** Files
are copied into the Nix store at build time — edits require a rebuild to take effect:
```nix
home.file.".config/wezterm" = {
  source = "${config.xdg.configHome}/nix/dotfiles/wezterm";
  recursive = true;
};
```

For configs fully managed by home-manager options (git, etc.), use the standard
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

All flake `inputs` are also spread in (`specialArgs = inputs // {...}`), so `nixpkgs`,
`darwin`, `scls`, etc. are directly available as module arguments too.

## Gotchas

### Homebrew `cleanup = "zap"` removes unlisted packages
`onActivation.cleanup = "zap"` in `apps.nix` means any brew/cask not declared in the
config will be **uninstalled on rebuild**. Always declare packages in `apps.nix` rather
than installing them manually with `brew`.

### Both build commands use `--impure`
`task build` and `task rebuild` both pass `--impure` to nix. This is intentional (needed
for hostname detection and Determinate Nix compatibility).

### Determinate Nix manages the nix daemon, not nix-darwin
`nix.enable = false` in `nix-core.nix` tells nix-darwin to leave the nix installation
alone. The Determinate Systems installer owns `/nix` and manages the daemon — don't
remove this setting or nix-darwin will conflict with it.
