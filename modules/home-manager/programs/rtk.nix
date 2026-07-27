{pkgs, ...}: let
  piExtension = pkgs.runCommand "rtk-pi-extension-${pkgs.rtk.version}.ts" {} ''
    export HOME="$TMPDIR"
    ${pkgs.rtk}/bin/rtk init --global --agent pi >/dev/null
    cp "$HOME/.pi/agent/extensions/rtk.ts" "$out"
  '';
in {
  home.packages = [pkgs.rtk];

  home.file = {
    ".pi/agent/extensions/rtk.ts".source = piExtension;

    "Library/Application Support/rtk/config.toml".text = ''
      [telemetry]
      enabled = false

      [hooks]
      exclude_commands = ["^curl", "^wget"]
    '';
  };
}
