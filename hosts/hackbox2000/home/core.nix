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
    # archives
    zip
    xz
    unzip
    p7zip

    # utils
    jq # A lightweight and flexible command-line JSON processor
    yq-go # yaml processer https://github.com/mikefarah/yq
    fzf # A command-line fuzzy finder

    aria2 # A lightweight multi-protocol & multi-source command-line download utility
    socat # replacement of openbsd-netcat
    nmap # A utility for network discovery and security auditing

    # misc
    cowsay
    file
    which
    tree
    gnused
    gnutar
    gawk
    zstd
    caddy
    gnupg

    # productivity
    glow # markdown previewer in terminal
    bat
    bottom
  ];

  programs = {
    fish = {
      enable = true;
      interactiveShellInit = ''
        set fish_greeting "SUP BRUH????" # Disable greeting
        export EDITOR="hx"
        export GOPRIVATE="gitlab.disney.com/skywalker-sound/*,gitlab.disney.com/skywalker-sound/libraries/golang/*"

        source $HOME/.config/fish/conf.d/abbr.fish

        alias config='/usr/bin/git --git-dir=/Users/ipiesh/.cfg/.git/ --work-tree=/Users/ipiesh'
        alias codaenv='/usr/bin/git --git-dir=$HOME/Library/Application\ Support/.cfg/.git/ --work-tree=$HOME/Library/Application\ Support/'

        ##Keep this at the end
        fzf --fish | source
      '';
      plugins = [
        # Enable a plugin (here grc for colorized command output) from nixpkgs
        {
          name = "grc";
          src = pkgs.fishPlugins.grc.src;
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
