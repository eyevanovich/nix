{
  pkgs,
  scls,
  ...
}: {
  imports = [
    ./programs
  ];

  # This value determines the home Manager release that your
  # configuration is compatible with. This helps avoid breakage
  # when a new home Manager release introduces backwards
  # incompatible changes.
  #
  # You can update home Manager without changing this value. See
  # the home Manager release notes for a list of state version
  # changes in each release.
  home.stateVersion = "23.11";

  home.packages = with pkgs; [
    # utils
    jq
    yq-go
    kubectx
    awscli
    fzf
    nmap
    revive
    wget

    # devops
    terraform
    terraform-docs
    packer
    kubectl
    kustomize
    k9s
    dive
    docker-slim
    glab
    tilt
    localstack
    git-lfs

    # dev tools
    direnv
    pre-commit
    shellcheck
    bat
    eza
    ripgrep

    # langs
    go
    cargo
    rustc
    rustfmt
    rust-analyzer
    clippy

    # database
    redis
    mysql80

    # productivity
    glow
    btop
    yazi
    tealdeer
    lazygit
    fd
    devbox
    go-task
    zoxide
    aider-chat
    navi
    _7zz # 7-Zip

    # media
    ffmpeg

    # misc
    cowsay
    tree
    neofetch
    grc
    scls.defaultPackage.${pkgs.stdenv.hostPlatform.system}
  ];
}
