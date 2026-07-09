# pi coding agent — shared resources across machines.
#
# Everything is symlinked out-of-store (mkOutOfStoreSymlink) so skills and
# extensions can be edited in the nix repo and picked up by `/reload` without a
# rebuild. Machine-local state (settings.json, auth.json, sessions, logs,
# caches, litellm-*, mcp.json, *.pem) is intentionally NOT managed here.
#
# Layout under dotfiles/pi/:
#   common/   — shared on every machine (skills, theme, keybindings, configs,
#               loose extensions beads + zellij)
#   personal/ — personal machines only (uber-go-style + permission-gate
#               extensions vendored out of the work gitlab repo)
#   work/     — work machines only (mysql-connector, litellm-spend)
#   hosts/<hostname>/ — single-machine overrides (APPEND_SYSTEM.md)
{
  config,
  profile,
  hostname,
  lib,
  pkgs,
  ...
}: let
  dotfiles = "${config.xdg.configHome}/nix/dotfiles/pi";
  piDir = ".pi/agent";
  link = path: {source = config.lib.file.mkOutOfStoreSymlink path;};

  # Extensions needing runtime npm deps: gitignored node_modules, reinstalled
  # on activation. path is relative to ~/.pi/agent.
  npmExtensions = lib.optionals (profile == "work") [
    "extensions/mysql-connector"
  ];
in {
  home.file =
    # ── common (all machines) ──
    {
      "${piDir}/skills" = link "${dotfiles}/common/skills";
      "${piDir}/themes/catppuccin-mocha.json" =
        link "${dotfiles}/common/themes/catppuccin-mocha.json";
      "${piDir}/keybindings.json" = link "${dotfiles}/common/keybindings.json";
      "${piDir}/uber-go-style.json" = link "${dotfiles}/common/uber-go-style.json";
      "${piDir}/permission-gate.json" = link "${dotfiles}/common/permission-gate.json";
      "${piDir}/extensions/beads" = link "${dotfiles}/common/extensions/beads";
      "${piDir}/extensions/zellij" = link "${dotfiles}/common/extensions/zellij";
    }
    # ── personal only: vendor uber-go-style + permission-gate extensions ──
    # (work machines load these from the gitlab pi-extensions-and-skills repo)
    // lib.optionalAttrs (profile == "personal") {
      "${piDir}/extensions/uber-go-style" =
        link "${dotfiles}/personal/extensions/uber-go-style";
      "${piDir}/extensions/permission-gate" =
        link "${dotfiles}/personal/extensions/permission-gate";
    }
    # ── work only ──
    // lib.optionalAttrs (profile == "work") {
      "${piDir}/extensions/mysql-connector" =
        link "${dotfiles}/work/extensions/mysql-connector";
      "${piDir}/extensions/litellm-spend.ts" =
        link "${dotfiles}/work/extensions/litellm-spend.ts";
    }
    # ── per-host override ──
    // lib.optionalAttrs (builtins.pathExists "${dotfiles}/hosts/${hostname}/APPEND_SYSTEM.md") {
      "${piDir}/APPEND_SYSTEM.md" =
        link "${dotfiles}/hosts/${hostname}/APPEND_SYSTEM.md";
    };

  # Reinstall gitignored node_modules for symlinked extensions that need them.
  home.activation.piExtensionDeps = lib.hm.dag.entryAfter ["writeBoundary"] (
    lib.concatMapStringsSep "\n" (ext: ''
      extDir="${dotfiles}/${ext}"
      if [ -f "$extDir/package.json" ] && [ ! -d "$extDir/node_modules" ]; then
        ${pkgs.nodejs}/bin/npm --prefix "$extDir" install --no-audit --no-fund >/dev/null 2>&1 || true
      fi
    '')
    npmExtensions
  );
}
