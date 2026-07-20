# pi coding agent — shared resources across machines.
#
# Everything is symlinked out-of-store (mkOutOfStoreSymlink) so skills and
# extensions can be edited in the nix repo and picked up by `/reload` without a
# rebuild. Machine-local state (settings.json, auth.json, sessions, logs,
# caches, litellm-*, mcp.json, *.pem) is intentionally NOT managed here.
#
# Layout under dotfiles/pi/:
#   common/   — shared on every machine
#   personal/ — personal machines only
#   work/     — work machines only
{
  config,
  profile,
  lib,
  pkgs,
  ...
}: let
  dotfiles = "${config.xdg.configHome}/nix/dotfiles/pi";
  piDir = ".pi/agent";
  link = path: {source = config.lib.file.mkOutOfStoreSymlink path;};

  commonSkills = [
    "ask-matt"
    "code-review"
    "codebase-design"
    "diagnosing-bugs"
    "domain-modeling"
    "grill-me"
    "grill-with-docs"
    "grilling"
    "handoff"
    "implement"
    "improve-codebase-architecture"
    "prototype"
    "qa"
    "research"
    "resolving-merge-conflicts"
    "setup-matt-pocock-skills"
    "tdd"
    "teach"
    "to-spec"
    "to-tickets"
    "triage"
    "wayfinder"
    "writing-great-skills"
  ];

  # Skills are installed and version-locked by pi's own skill manager under
  # ~/.agents/skills (see ~/.agents/.skill-lock.json). We only symlink them into
  # ~/.pi/agent/skills; we do NOT vendor them into this repo.
  agentsSkills = "${config.home.homeDirectory}/.agents/skills";
  commonSkillLinks = lib.listToAttrs (map (name: {
      name = "${piDir}/skills/${name}";
      value = link "${agentsSkills}/${name}";
    })
    commonSkills);

  commonFiles =
    commonSkillLinks
    // {
      "${piDir}/themes/catppuccin-mocha.json" =
        link "${dotfiles}/common/themes/catppuccin-mocha.json";
      "${piDir}/keybindings.json" = link "${dotfiles}/common/keybindings.json";
      "${piDir}/uber-go-style.json" = link "${dotfiles}/common/uber-go-style.json";
      "${piDir}/permission-gate.json" = link "${dotfiles}/common/permission-gate.json";
      "${piDir}/extensions/beads" = link "${dotfiles}/common/extensions/beads";
      "${piDir}/extensions/subagent/config.json" =
        link "${dotfiles}/common/extensions/subagent/config.json";
      "${piDir}/extensions/zellij" = link "${dotfiles}/common/extensions/zellij";
    };

  personalFiles = lib.optionalAttrs (profile == "personal") {
    "${piDir}/extensions/uber-go-style" =
      link "${dotfiles}/personal/extensions/uber-go-style";
    "${piDir}/extensions/permission-gate" =
      link "${dotfiles}/personal/extensions/permission-gate";
    "${piDir}/extensions/codex-status.ts" =
      link "${dotfiles}/personal/extensions/codex-status.ts";
  };

  profileAppendSystem = lib.optionalAttrs (builtins.pathExists "${dotfiles}/${profile}/APPEND_SYSTEM.md") {
    "${piDir}/APPEND_SYSTEM.md" = link "${dotfiles}/${profile}/APPEND_SYSTEM.md";
  };

  workFiles = lib.optionalAttrs (profile == "work") {
    "${piDir}/extensions/mysql-connector" =
      link "${dotfiles}/work/extensions/mysql-connector";
  };

  homeFiles = commonFiles // personalFiles // workFiles // profileAppendSystem;
  managedPaths = builtins.attrNames homeFiles;

  # Legacy loose extension files from pre-Nix machines. Back these up to avoid
  # duplicate extension loading once the directory packages are managed.
  legacyPaths = [
    "${piDir}/extensions/zellij.ts"
    "${piDir}/extensions/permission-gate.ts"
  ];

  piPackages =
    [
      "npm:@dreki-gg/pi-context7"
      "git:github.com/championswimmer/pi-context-usage"
      "npm:pi-mcp-adapter"
      "npm:pi-powerline-footer"
      "npm:pi-subagents"
      "npm:pi-web-access"
      "git:gitlab.com/gitlab-org/ai/skills"
    ]
    ++ lib.optionals (profile == "personal") [
      "npm:@luxusai/pi-hindsight"
      "npm:@ryan_nookpi/pi-extension-headroom"
    ];

  removedPiPackages =
    [
      "npm:pi-schedule-prompt"
    ]
    ++ lib.optionals (profile == "work") [
      "npm:@luxusai/pi-hindsight"
      "npm:@ryan_nookpi/pi-extension-headroom"
    ];

  # Extensions needing runtime npm deps: gitignored node_modules, reinstalled
  # on activation. path is relative to ~/.pi/agent.
  npmExtensions = lib.optionals (profile == "work") [
    "extensions/mysql-connector"
  ];
in {
  home.file = homeFiles;

  home.activation.piAdoptExistingFiles = lib.hm.dag.entryBefore ["checkLinkTargets"] ''
    backupDir="$HOME/.pi/agent/pre-nix-backup"
    backup_managed_path() {
      target="$1"
      if [ ! -e "$target" ] && [ ! -L "$target" ]; then
        return
      fi

      if [ -L "$target" ]; then
        linkTarget="$(${pkgs.coreutils}/bin/readlink "$target")"
        case "$linkTarget" in
          /nix/store/*) return ;;
        esac
      fi

      rel="''${target#$HOME/.pi/agent/}"
      stamp="$(${pkgs.coreutils}/bin/date +%Y%m%d%H%M%S)"
      mkdir -p "$backupDir/$(${pkgs.coreutils}/bin/dirname "$rel")"
      mv "$target" "$backupDir/$rel.$stamp"
    }

    ${lib.concatMapStringsSep "\n" (rel: ''
      backup_managed_path "$HOME/${rel}"
    '') (managedPaths ++ legacyPaths)}
  '';

  home.activation.piPackages = lib.hm.dag.entryAfter ["writeBoundary"] ''
    piBin="${pkgs.pi-coding-agent}/bin/pi"
    piPath="${pkgs.pi-coding-agent}/bin:${pkgs.git}/bin:${pkgs.nodejs}/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
    if [ -x "$piBin" ]; then
      piList="$(env PATH="$piPath" "$piBin" list 2>/dev/null || true)"

      ${lib.concatMapStringsSep "\n" (source: ''
        if printf '%s\n' "$piList" | ${pkgs.gnugrep}/bin/grep -Fq "${source}"; then
          echo "Removing pi package ${source}"
          env PATH="$piPath" "$piBin" remove "${source}" || echo "warning: failed to remove ${source}"
          piList="$(env PATH="$piPath" "$piBin" list 2>/dev/null || true)"
        fi
      '')
      removedPiPackages}

      ${lib.concatMapStringsSep "\n" (source: ''
        if ! printf '%s\n' "$piList" | ${pkgs.gnugrep}/bin/grep -Fq "${source}"; then
          echo "Installing pi package ${source}"
          env PATH="$piPath" "$piBin" install "${source}" || echo "warning: failed to install ${source}"
          piList="$(env PATH="$piPath" "$piBin" list 2>/dev/null || true)"
        fi
      '')
      piPackages}
    fi
  '';

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
