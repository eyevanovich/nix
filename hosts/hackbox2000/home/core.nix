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
    glow # markdown previewer in terminal
    bat # better cat
    btop # better top
    yazi # file explorer
    tealdeer # tldr in rust
    zellij # terminal multiplexer
    lazygit # git TUI
    direnv
    just # justfile
    fd # better find
    eza # better ls

    # misc
    cowsay
    tree
    neofetch
    grc # for color command output
  ];

  programs = {
    git = {
      enable = true; 
      userName = "Ivan Miles Piesh";
      userEmail = "ipiesh@skysound.com";
    };
    helix = {
      enable = true;
      defaultEditor = true;
      extraPackages = [
        pkgs.marksman
        pkgs.taplo
        pkgs.typos-lsp
      ];
      settings = {
        theme = "catppuccin_mocha";
        ###############################################################################################
        # EDITOR
        ###############################################################################################
        editor = {
          true-color = true;
          cursorline = true;
          color-modes = true;
          bufferline = "multiple";
          scrolloff = 10;
          gutters = ["diagnostics" "spacer" "line-numbers" "spacer" "diff"];
        };
        editor.whitespace.characters = {
          space = "·";
          nbsp = "⍽";
          nnbsp = "␣";
          tab = "→";
          newline = "⏎";
          tabpad = "·"; # Tabs will look like "→···" (depending on tab width)
        };
        editor.file-picker = {
          hidden = false;
        };
        editor.cursor-shape = {
          insert = "bar";
          normal = "block";
          select = "underline";
        };
        editor.lsp = {
          display-messages = true;
        };
        editor.statusline = {
          left = [
            "mode"
            "spacer"
            "version-control"
            "spacer"
            "separator"
            "file-name"
            "file-modification-indicator"
          ];
          right = [
            "spinner"
            "spacer"
            "workspace-diagnostics"
            "separator"
            "spacer"
            "diagnostics"
            "position"
            "primary-selection-length"
            "file-encoding"
            "file-line-ending"
            "file-type"
          ];
          separator = "│";
          mode.normal = "NORMAL";
          mode.insert = "INSERT";
          mode.select = "SELECT";
        };
        editor.indent-guides = {
          render = true;
          character = "|";
          skip-levels = 1;
        };
        editor.soft-wrap = {
          enable = true;
          max-wrap = 25; # increase value to reduce forced mid-word wrapping
          max-indent-retain = 0;
        };
        ##############################################################################################3
        # KEYs
        ##############################################################################################3
        keys.normal = {
          C-j = ["extend_to_line_bounds" "delete_selection" "paste_after"];
          C-k = ["extend_to_line_bounds" "delete_selection" "move_line_up" "paste_before"];
          esc = ["collapse_selection" "keep_primary_selection"];
          up = "no_op";
          down = "no_op";
          left = "no_op";
          right = "no_op";
          pageup = "no_op";
          pagedown = "no_op";
          home = "no_op";
          end = "no_op";
          "A-," = "goto_previous_buffer";
          "A-." = "goto_next_buffer";
          "A-w" = ":buffer-close";
          "A-/" = "repeat_last_motion";
          X = ["extend_line_up" "extend_to_line_bounds"];
        };
        keys.select = {
          C-c = "toggle_comments";
          up = "no_op";
          down = "no_op";
          left = "no_op";
          right = "no_op";
          pageup = "no_op";
          pagedown = "no_op";
          home = "no_op";
          X = ["extend_line_up" "extend_to_line_bounds"];
          end = "no_op";
        };
        keys.insert = {
          C-c = "toggle_comments";
          C-space = "completion";
          up = "no_op";
          down = "no_op";
          left = "no_op";
          right = "no_op";
          pageup = "no_op";
          pagedown = "no_op";
          home = "no_op";
          end = "no_op";
        };
        keys.normal.space.c = {
          r = [":w" ":config-reload"];
          o = ":config-open";
          l = ":o ~/.config/helix/languages.toml";
        };
        keys.normal.space.o = {
          g = ":sh zellij run -fc --height 100% --width 100% -x 0 -y 0 -- lazygit";
          f = ":sh zellij run -fc -- yazi";
          m = ":sh zellij run -fc -- glow -p ./README.md";
          r = ":set whitespace.render none";
          w = ":set whitespace.render all";
        };
        keys.normal.space.a = {
          g = [":sh go mod tidy" ":reload-all" ":lsp-restart"];
          r = [":reload-all" ":lsp-restart"];
          l = ":sh zellij run -d right -- revive -formatter stylish ./...";
        };
        keys.normal.space = {
          W = ":write";
        };
      };
      languages.language = [
        {
          name = "elixir";
          auto-format = true;
        }
      ];
    };
    wezterm = {
      enable = true;
      extraConfig = ''
        -- Pull in the wezterm API
        local wezterm = require 'wezterm'

        -- This table will hold the configuration.
        local config = {}

        local mux = wezterm.mux
        local act = wezterm.action

        wezterm.on('gui-startup', function()
          local tab, pane, window = mux.spawn_window({})
          window:gui_window():maximize()
        end)

        if wezterm.config_builder then
          config = wezterm.config_builder()
        end

        -- This is where you actually apply your config choices
        config.color_scheme = 'Catppuccin Mocha'
        config.font = wezterm.font 'MesloLGSDZ Nerd Font Mono'
        config.font_size = 13
        config.window_decorations = "RESIZE"
        config.hide_tab_bar_if_only_one_tab = true
        config.window_frame = {
          font = wezterm.font { family = 'MesloLGSDZ Nerd Font Mono', weight = 'Regular' },
        }
        config.term = "wezterm"

        config.keys = {
          {
            -- disable this because I constantly fat finger
            -- tab and caps lock (CTRL) at the same time
            key = 'Tab',
            mods = 'CTRL',
            action = wezterm.action.DisableDefaultAssignment,
          },
        }

        -- and finally, return the configuration to wezterm
        return config
      '';
    };
    fish = {
      enable = true;
      interactiveShellInit = ''
        set fish_greeting # Disable greeting
        export EDITOR="hx"
        export GOPRIVATE="gitlab.disney.com/skywalker-sound/*,gitlab.disney.com/skywalker-sound/libraries/golang/*"

        alias config='/usr/bin/git --git-dir=/Users/ipiesh/.cfg/.git/ --work-tree=/Users/ipiesh'

        fish_add_path "/opt/homebrew/bin/"

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
        {
          name = "grc";
          src = pkgs.fishPlugins.grc.src;
        }
        {
          name = "tide";
          src = pkgs.fishPlugins.tide.src;
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
