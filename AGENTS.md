# AGENTS.md - Agent Guidelines for nix-darwin Configuration

This repository contains macOS declarative configuration using nix-darwin, home-manager, and nix-homebrew.

## Build Commands

| Command | Description |
|---------|-------------|
| `task rebuild` | Rebuild current host (uses `scutil --get LocalHostName`); pass hostname as arg to target another |
| `task build` | First-pass build using `nix run nix-darwin` (for fresh machines without darwin-rebuild) |
| `task darwin-debug` | Verbose trace build + switch, useful for diagnosing failures |
| `task fmt` | Format all Nix files with alejandra (`nix fmt .`) |
| `task update` | Update `flake.lock` (`nix flake update`) |
| `task garbage` | Wipe system profiles older than 7 days and GC unused store entries |
| `task history` | Show nix system profile generations |

### Running a Single Test / Dry Run

There are no traditional unit tests in this Nix configuration. To verify changes:

```bash
# Dry-run build (shows what would happen without switching)
darwin-rebuild build --flake .#<hostname> --impure --show-trace

# Or use darwin-debug to see verbose output
task darwin-debug
```

## Code Style Guidelines

### General Conventions

- **Formatting**: Always run `task fmt` (alejandra) before committing
- **File extensions**: Use `.nix` for all Nix files
- **Module structure**: Follow the existing `modules/darwin/` and `modules/home-manager/` hierarchy

### Imports Pattern

Use the standard attribute set pattern for all module files:

```nix
{ pkgs, lib, profile, ... }: {
  # module content
}
```

Available in most modules:
- `pkgs` - nixpkgs package set
- `lib` - nixpkgs lib functions
- `profile` - "personal" or "work" (from hosts.nix)
- `username`, `hostname`, `uid` - user/host info

### Naming Conventions

- **Files**: kebab-case (e.g., `apps.nix`, `karabiner.nix`)
- **Options**: kebab-case (e.g., `enableRosetta`, `autoUpdate`)
- **Variables in attribute sets**: camelCase (e.g., `myVariable`)
- **Let bindings**: camelCase

### Conditional Logic

Use `lib.optionals` for profile-based conditionals:

```nix
casks = [ "shared-app" ]
  ++ lib.optionals (profile == "personal") [ "steam" "splice" ]
  ++ lib.optionals (profile == "work") [ "cursor" ];
```

Use `lib.optional` for single conditional:

```nix
home.packages = [ pkg1 ]
  ++ lib.optional (profile == "work") workPackage;
```

### Packages and Casks

- **System packages** (nix): Add to `environment.systemPackages` in `modules/darwin/apps/apps.nix`
- **Homebrew brews**: Add to `homebrew.brews` in `modules/darwin/apps/apps.nix`
- **Homebrew casks**: Add to `homebrew.casks` in `modules/darwin/apps/apps.nix`
- **User packages** (home-manager): Add to `home.packages` in `modules/home-manager/core.nix`
- **Mac App Store apps**: Add to `homebrew.masApps` in `modules/darwin/apps/apps.nix`

### Dotfile Management

Two approaches exist in this repo:

1. **`mkOutOfStoreSymlink`** - For configs needing immediate edits without rebuild:
   ```nix
   home.file.".config/helix/config.toml".source =
     config.lib.file.mkOutOfStoreSymlink
       "${config.xdg.configHome}/nix/dotfiles/helix/config.toml";
   ```

2. **Plain `source` with `recursive = true`** - For configs requiring rebuild:
   ```nix
   home.file.".config/wezterm" = {
     source = "${config.xdg.configHome}/nix/dotfiles/wezterm";
     recursive = true;
   };
   ```

### Error Handling

- Always use `--show-trace` when debugging build failures
- Use `--impure` for hostname detection (required in this repo)
- Check `task darwin-debug` output for verbose error information

### Adding a New Host

1. Add entry to `hosts.nix` with `system`, `profile`, and `uid`
2. Run `task rebuild <hostname>` or `task build` on the new machine

### Homebrew Cleanup Warning

`onActivation.cleanup = "zap"` in apps.nix means unlisted packages will be **uninstalled on rebuild**. Always declare packages in `modules/darwin/apps/apps.nix` rather than installing manually.

### Nix Daemon

`nix.enable = false` in `nix-core.nix` tells nix-darwin to leave nix installation alone. The Determinate Systems installer owns `/nix` — don't change this setting.

### Common Gotchas

- Both build commands use `--impure` for hostname detection and Determinate Nix compatibility
- Overlays are defined in `overlays/default.nix` and applied in `flake.nix`
- All flake inputs are available as module arguments (e.g., `scls`, `nixpkgs`, `darwin`, `home-manager`)

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
