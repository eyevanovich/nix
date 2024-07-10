{pkgs, ...}: {
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
    jq # A lightweight and flexible command-line JSON processor
    yq-go # yaml processer https://github.com/mikefarah/yq
    kubectx
    awscli
    pre-commit
    fzf
    nmap

    # langs
    go

    # productivity
    glow # markdown previewer in terminal
    btop # better top
    yazi # file explorer
    tealdeer # tldr in rust
    lazygit # git TUI
    fd # better find
    devbox # easier declarative dev env
    go-task # taskfile
    zoxide # better cd
    wireguard-tools

    # misc
    cowsay
    tree
    neofetch
    grc # for color command output
  ];
}
