{pkgs, ...}: {
  imports = [
    ./programs
  ];

  home.packages = with pkgs; [
    # utils
    jq # A lightweight and flexible command-line JSON processor
    yq-go # yaml processer https://github.com/mikefarah/yq
    kubectx
    awscli
    pre-commit
    fzf

    # langs
    go

    # productivity
    glow # markdown previewer in terminal
    # bat # better cat
    btop # better top
    yazi # file explorer
    tealdeer # tldr in rust
    lazygit # git TUI
    direnv
    just # justfile
    fd # better find
    devbox
    go-task # taskfile
    zoxide # better cd

    # misc
    cowsay
    tree
    neofetch
    grc # for color command output
  ];
}
