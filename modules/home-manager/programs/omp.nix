# Oh My Pi is a separate Pi fork. Keep its binary and ~/.omp state independent
# from the upstream Pi installation managed by pi.nix.
{
  config,
  lib,
  pkgs,
  ...
}: let
  release = import ./omp-release.nix;
  asset =
    release.assets.${pkgs.stdenv.hostPlatform.system}
      or (throw "OMP does not publish a release binary for ${pkgs.stdenv.hostPlatform.system}");
  omp = pkgs.stdenvNoCC.mkDerivation {
    pname = "omp";
    version = lib.removePrefix "v" release.tag;

    src = pkgs.fetchurl {
      url = "https://github.com/can1357/oh-my-pi/releases/download/${release.tag}/${asset.name}";
      hash = asset.hash;
    };

    dontUnpack = true;
    installPhase = ''
      install -Dm755 "$src" "$out/bin/omp"
    '';

    meta = {
      description = "Oh My Pi coding agent";
      homepage = "https://github.com/can1357/oh-my-pi";
      license = lib.licenses.mit;
      mainProgram = "omp";
      platforms = builtins.attrNames release.assets;
    };
  };
in {
  home.packages = [omp];
}
