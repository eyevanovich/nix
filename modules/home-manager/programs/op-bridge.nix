# Mac side of op-bridge: `op-bridge serve user@host` lets a headless host use this
# Mac's 1Password CLI (SSO) through a Rex tunnel. See scripts/op_bridge.py.
{
  lib,
  pkgs,
  ...
}: {
  home.packages = lib.optionals pkgs.stdenv.hostPlatform.isDarwin [
    (pkgs.callPackage ../../../pkgs/op-bridge.nix {name = "op-bridge";})
  ];
}
