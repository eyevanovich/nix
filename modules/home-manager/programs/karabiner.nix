{
  lib,
  pkgs,
  ...
}: let
  prepareConfig = pkgs.writeShellApplication {
    name = "prepare-karabiner-config";
    runtimeInputs = [pkgs.coreutils];
    text = ''
      config="$1"
      source=${../../../dotfiles/karabiner/karabiner.json}
      legacyLink=""
      if [[ -L "$config" ]]; then
        legacyLink=$(readlink -- "$config")
        case "$legacyLink" in
          "${builtins.storeDir}/"*-home-manager-files/.config/karabiner/karabiner.json)
            if [[ -f "$config" ]]; then source="$config"; fi
            ;;
          *) exit 0 ;;
        esac
      elif [[ -e "$config" ]]; then
        exit 0
      fi

      umask 077
      mkdir -p -- "$(dirname -- "$config")"
      tmp=$(mktemp "$config.XXXXXX")
      trap 'rm -f -- "$tmp"' EXIT
      install -m 600 -- "$source" "$tmp"
      if [[ -n "$legacyLink" && "$(readlink -- "$config")" == "$legacyLink" ]]; then
        mv -fT -- "$tmp" "$config"
      else
        mv -nT -- "$tmp" "$config"
      fi
    '';
  };
in
  lib.mkIf pkgs.stdenv.hostPlatform.isDarwin {
    home.file.".config/karabiner/assets" = {
      source = ../../../dotfiles/karabiner/assets;
      recursive = true;
    };

    # Preserve the old config before Home Manager removes the obsolete link.
    home.activation.prepareKarabinerConfig = lib.hm.dag.entryBetween ["linkGeneration"] ["writeBoundary"] ''
      run ${lib.getExe prepareConfig} "$HOME/.config/karabiner/karabiner.json"
    '';
  }
