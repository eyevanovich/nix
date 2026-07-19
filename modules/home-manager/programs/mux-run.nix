{pkgs, ...}: let
  muxRun = pkgs.writeShellApplication {
    name = "mux-run";
    runtimeInputs = [
      pkgs.coreutils
      pkgs.jq
    ];
    text = builtins.readFile ../../../scripts/mux-run.sh;
  };
in {
  home.packages = [muxRun];
}
