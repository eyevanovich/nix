{pkgs, ...}: {
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

    # productivity
    helix # Terminal editor
    glow # markdown previewer in terminal
    bat # better cat
    btop # better top
    yazi # file explorer
    tealdeer # tldr in rust
    zellij # terminal multiplexer
    lazygit # git TUI
    direnv
    just # justfile

    # lsp
    taplo
    marksman

    # misc
    cowsay
    tree
    neofetch
    grc # for color command output
  ];

  programs = {
    fish = {
      enable = true;
      interactiveShellInit = ''
        set fish_greeting # Disable greeting
        export EDITOR="hx"
        export GOPRIVATE="gitlab.disney.com/skywalker-sound/*,gitlab.disney.com/skywalker-sound/libraries/golang/*"

        alias config='/usr/bin/git --git-dir=/Users/ipiesh/.cfg/.git/ --work-tree=/Users/ipiesh'

        ##Keep this at the end
        fzf --fish | source
      '';
      shellAliases = {
          "ls" = "ls -lAF";
          mkdir = "mkdir -p";
          ".." = "cd ..";
          "..." = "cd ../..";
      };
      shellAbbrs = {
        g = "git";
        m = "make";
        j = "just";
        lg = "lazygit";
        zj = "zellij";
      };
      plugins = [
        # Enable a plugin (here grc for colorized command output) from nixpkgs
        {
          name = "grc";
          src = pkgs.fishPlugins.grc.src;
        }
        {
          name = "tide";
          src = pkgs.fishPlugins.tide.src;
        }
        # Manual packaging and enable a plugin
        {
          name = "fzf";
          src = pkgs.fishPlugins.fzf-fish.src;
        }
        # Manual packaging and enable a plugin
        {
          name = "z";
          src = pkgs.fetchFromGitHub {
            owner = "jethrokuan";
            repo = "z";
            rev = "e0e1b9dfdba362f8ab1ae8c1afc7ccf62b89f7eb";
            sha256 = "0dbnir6jbwjpjalz14snzd3cgdysgcs3raznsijd6savad3qhijc";
          };
        }
      ];
    };
  };
}
