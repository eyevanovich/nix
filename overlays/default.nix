{inputs}: [
  # Pin localstack to working nixpkgs rev (python3.13-plux test broken on unstable)
  (final: prev: {
    localstack =
      (import inputs.nixpkgs-localstack {
        system = final.stdenv.hostPlatform.system;
      }).localstack;
  })
]
