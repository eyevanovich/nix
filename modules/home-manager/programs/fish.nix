{pkgs, lib, profile, ...}: {
  programs.fish = {
    enable = true;
    interactiveShellInit = ''
      set fish_greeting # Disable greeting
      export EDITOR="hx"
      export STARSHIP_CONFIG="$HOME/.config/starship/starship.toml"
    '' + lib.optionalString (profile == "work") ''
      export GOPRIVATE="gitlab.disney.com/skywalker-sound/*,gitlab.disney.com/skywalker-sound/libraries/golang/*"
    '' + ''

      alias config='/usr/bin/git --git-dir=/Users/ipiesh/.cfg/.git/ --work-tree=/Users/ipiesh'

      fish_add_path "/opt/homebrew/bin/"

      ##Keep this at the end
      fzf --fish | source
      zoxide init fish | source
    '';
    shellAliases = {
      "ls" = "eza -lAF";
      mkdir = "mkdir -p";
      ".." = "cd ..";
      "..." = "cd ../..";
    };
    shellAbbrs = {
      g = "git";
      m = "make";
      t = "task";
      lg = "lazygit";
      j = "zellij -l welcome";
    };
    plugins = [
      {
        name = "grc";
        src = pkgs.fishPlugins.grc.src;
      }
      {
        name = "fzf";
        src = pkgs.fishPlugins.fzf-fish.src;
      }
      {
        name = "bass";
        src = pkgs.fishPlugins.bass.src;
      }
      # Manual packaging and enable a plugin
      # {
      #   name = "z";
      #   src = pkgs.fetchFromGitHub {
      #     owner = "jethrokuan";
      #     repo = "z";
      #     rev = "e0e1b9dfdba362f8ab1ae8c1afc7ccf62b89f7eb";
      #     sha256 = "0dbnir6jbwjpjalz14snzd3cgdysgcs3raznsijd6savad3qhijc";
      #   };
      # }
    ];
  };
}
