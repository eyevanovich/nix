{
  config,
  pkgs,
  lib,
  profile,
  ...
}: let
  isDarwin = pkgs.stdenv.hostPlatform.isDarwin;
in {
  home.sessionPath = lib.optionals isDarwin [
    "/Users/ipiesh/Library/Application Support/com.superlogical.rex/RexServer/Versions/Current/Rex Server.app/Contents/MacOS"
  ];

  programs.fish = {
    enable = true;
    interactiveShellInit =
      ''
        set fish_greeting # Disable greeting
        export EDITOR="hx"
        export STARSHIP_CONFIG="$HOME/.config/starship/starship.toml"
      ''
      + lib.optionalString (profile == "work") ''
        export GOPRIVATE="gitlab.disney.com/skywalker-sound/*,gitlab.disney.com/skywalker-sound/libraries/golang/*"
        export NODE_EXTRA_CA_CERTS="/etc/ssl/certs/all_certs.pem"
        export GIT_TERMINAL_PROMPT=0
      ''
      + lib.optionalString (profile == "personal" && isDarwin) ''
        set -gx SSH_AUTH_SOCK /Users/ipiesh/Library/Containers/com.maxgoedjen.Secretive.SecretAgent/Data/socket.ssh      ''
      + ''

        alias config='/usr/bin/git --git-dir=${config.home.homeDirectory}/.cfg/.git/ --work-tree=${config.home.homeDirectory}'
      ''
      + lib.optionalString isDarwin ''
        fish_add_path "/opt/homebrew/bin/"
      ''
      + ''

        if set -q REX_BIN_DIR
          fish_add_path --path --prepend --move $REX_BIN_DIR
        end

        fnm env --shell fish | source

        ##Keep this at the end
        fzf --fish | source
        atuin init fish | source
      '';
    shellAliases = {
      "ls" = "eza -lA --classify=always";
      mkdir = "mkdir -p";
      ".." = "cd ..";
      "..." = "cd ../..";
    };
    shellAbbrs = {
      g = "git";
      m = "make";
      t = "task";
      lg = "lazygit";
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
    functions.fish_user_key_bindings = ''
      bind ctrl-r _atuin_search
      bind -M insert ctrl-r _atuin_search
      bind -M default ctrl-r _atuin_search
      bind -M visual ctrl-r _atuin_search
      bind -M insert up _atuin_bind_up
    '';
  };
}
