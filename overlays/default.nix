{inputs}: [
  # Pin localstack to working nixpkgs rev (python3.13-plux test broken on unstable)
  (final: prev: {
    localstack =
      (import inputs.nixpkgs-localstack {
        system = final.stdenv.hostPlatform.system;
      }).localstack;
  })
  # direnv 2.37.1 not yet in darwin binary cache; its test phase
  # (./test/direnv-test.zsh) hangs indefinitely under the build sandbox.
  (final: prev: {
    direnv = prev.direnv.overrideAttrs (_: {
      doCheck = false;
      doInstallCheck = false;
    });
  })
]
