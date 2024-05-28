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

  programs.zellij = {
    enable = true;
    settings = {
      # // If you'd like to override the default keybindings completely, be sure to change "keybinds" to "keybinds clear-defaults=true"
      # keybinds {
      #     normal {
      #         // uncomment this and adjust key if using copy_on_select=false
      #         // bind "Alt c" { Copy; }
      #     }
      #     locked {
      #         bind "Ctrl g" { SwitchToMode "Normal"; }
      #     }
      #     resize {
      #         bind "Ctrl n" { SwitchToMode "Normal"; }
      #         bind "h" "Left" { Resize "Increase Left"; }
      #         bind "j" "Down" { Resize "Increase Down"; }
      #         bind "k" "Up" { Resize "Increase Up"; }
      #         bind "l" "Right" { Resize "Increase Right"; }
      #         bind "H" { Resize "Decrease Left"; }
      #         bind "J" { Resize "Decrease Down"; }
      #         bind "K" { Resize "Decrease Up"; }
      #         bind "L" { Resize "Decrease Right"; }
      #         bind "=" "+" { Resize "Increase"; }
      #         bind "-" { Resize "Decrease"; }
      #     }
      #     pane {
      #         bind "Ctrl p" { SwitchToMode "Normal"; }
      #         bind "h" "Left" { MoveFocus "Left"; }
      #         bind "l" "Right" { MoveFocus "Right"; }
      #         bind "j" "Down" { MoveFocus "Down"; }
      #         bind "k" "Up" { MoveFocus "Up"; }
      #         bind "p" { SwitchFocus; }
      #         bind "n" { NewPane; SwitchToMode "Normal"; }
      #         bind "d" { NewPane "Down"; SwitchToMode "Normal"; }
      #         bind "r" { NewPane "Right"; SwitchToMode "Normal"; }
      #         bind "x" { CloseFocus; SwitchToMode "Normal"; }
      #         bind "f" { ToggleFocusFullscreen; SwitchToMode "Normal"; }
      #         bind "z" { TogglePaneFrames; SwitchToMode "Normal"; }
      #         bind "w" { ToggleFloatingPanes; SwitchToMode "Normal"; }
      #         bind "e" { TogglePaneEmbedOrFloating; SwitchToMode "Normal"; }
      #         bind "c" { SwitchToMode "RenamePane"; PaneNameInput 0;}
      #     }
      #     move {
      #         bind "Ctrl h" { SwitchToMode "Normal"; }
      #         bind "n" "Tab" { MovePane; }
      #         bind "p" { MovePaneBackwards; }
      #         bind "h" "Left" { MovePane "Left"; }
      #         bind "j" "Down" { MovePane "Down"; }
      #         bind "k" "Up" { MovePane "Up"; }
      #         bind "l" "Right" { MovePane "Right"; }
      #     }
      #     tab {
      #         bind "Ctrl t" { SwitchToMode "Normal"; }
      #         bind "r" { SwitchToMode "RenameTab"; TabNameInput 0; }
      #         bind "h" "Left" "Up" "k" { GoToPreviousTab; }
      #         bind "l" "Right" "Down" "j" { GoToNextTab; }
      #         bind "n" { NewTab; SwitchToMode "Normal"; }
      #         bind "x" { CloseTab; SwitchToMode "Normal"; }
      #         bind "s" { ToggleActiveSyncTab; SwitchToMode "Normal"; }
      #         bind "1" { GoToTab 1; SwitchToMode "Normal"; }
      #         bind "2" { GoToTab 2; SwitchToMode "Normal"; }
      #         bind "3" { GoToTab 3; SwitchToMode "Normal"; }
      #         bind "4" { GoToTab 4; SwitchToMode "Normal"; }
      #         bind "5" { GoToTab 5; SwitchToMode "Normal"; }
      #         bind "6" { GoToTab 6; SwitchToMode "Normal"; }
      #         bind "7" { GoToTab 7; SwitchToMode "Normal"; }
      #         bind "8" { GoToTab 8; SwitchToMode "Normal"; }
      #         bind "9" { GoToTab 9; SwitchToMode "Normal"; }
      #         bind "Tab" { ToggleTab; }
      #     }
      #     scroll {
      #         bind "Ctrl s" { SwitchToMode "Normal"; }
      #         bind "e" { EditScrollback; SwitchToMode "Normal"; }
      #         bind "s" { SwitchToMode "EnterSearch"; SearchInput 0; }
      #         bind "Ctrl c" { ScrollToBottom; SwitchToMode "Normal"; }
      #         bind "j" "Down" { ScrollDown; }
      #         bind "k" "Up" { ScrollUp; }
      #         bind "Ctrl f" "PageDown" "Right" "l" { PageScrollDown; }
      #         bind "Ctrl b" "PageUp" "Left" "h" { PageScrollUp; }
      #         bind "d" { HalfPageScrollDown; }
      #         bind "u" { HalfPageScrollUp; }
      #         // uncomment this and adjust key if using copy_on_select=false
      #         // bind "Alt c" { Copy; }
      #     }
      #     search {
      #         bind "Ctrl s" { SwitchToMode "Normal"; }
      #         bind "Ctrl c" { ScrollToBottom; SwitchToMode "Normal"; }
      #         bind "j" "Down" { ScrollDown; }
      #         bind "k" "Up" { ScrollUp; }
      #         bind "Ctrl f" "PageDown" "Right" "l" { PageScrollDown; }
      #         bind "Ctrl b" "PageUp" "Left" "h" { PageScrollUp; }
      #         bind "d" { HalfPageScrollDown; }
      #         bind "u" { HalfPageScrollUp; }
      #         bind "n" { Search "down"; }
      #         bind "p" { Search "up"; }
      #         bind "c" { SearchToggleOption "CaseSensitivity"; }
      #         bind "w" { SearchToggleOption "Wrap"; }
      #         bind "o" { SearchToggleOption "WholeWord"; }
      #     }
      #     entersearch {
      #         bind "Ctrl c" "Esc" { SwitchToMode "Scroll"; }
      #         bind "Enter" { SwitchToMode "Search"; }
      #     }
      #     renametab {
      #         bind "Ctrl c" { SwitchToMode "Normal"; }
      #         bind "Esc" { UndoRenameTab; SwitchToMode "Tab"; }
      #     }
      #     renamepane {
      #         bind "Ctrl c" { SwitchToMode "Normal"; }
      #         bind "Esc" { UndoRenamePane; SwitchToMode "Pane"; }
      #     }
      #     session {
      #         bind "Ctrl o" { SwitchToMode "Normal"; }
      #         bind "Ctrl s" { SwitchToMode "Scroll"; }
      #         bind "d" { Detach; }
      #     }
      #     tmux {
      #         bind "[" { SwitchToMode "Scroll"; }
      #         bind "Ctrl b" { Write 2; SwitchToMode "Normal"; }
      #         bind "\"" { NewPane "Down"; SwitchToMode "Normal"; }
      #         bind "%" { NewPane "Right"; SwitchToMode "Normal"; }
      #         bind "z" { ToggleFocusFullscreen; SwitchToMode "Normal"; }
      #         bind "c" { NewTab; SwitchToMode "Normal"; }
      #         bind "," { SwitchToMode "RenameTab"; }
      #         bind "p" { GoToPreviousTab; SwitchToMode "Normal"; }
      #         bind "n" { GoToNextTab; SwitchToMode "Normal"; }
      #         bind "Left" { MoveFocus "Left"; SwitchToMode "Normal"; }
      #         bind "Right" { MoveFocus "Right"; SwitchToMode "Normal"; }
      #         bind "Down" { MoveFocus "Down"; SwitchToMode "Normal"; }
      #         bind "Up" { MoveFocus "Up"; SwitchToMode "Normal"; }
      #         bind "h" { MoveFocus "Left"; SwitchToMode "Normal"; }
      #         bind "l" { MoveFocus "Right"; SwitchToMode "Normal"; }
      #         bind "j" { MoveFocus "Down"; SwitchToMode "Normal"; }
      #         bind "k" { MoveFocus "Up"; SwitchToMode "Normal"; }
      #         bind "o" { FocusNextPane; }
      #         bind "d" { Detach; }
      #         bind "Space" { NextSwapLayout; }
      #         bind "x" { CloseFocus; SwitchToMode "Normal"; }
      #     }
      #     shared_except "locked" {
      #         bind "Ctrl g" { SwitchToMode "Locked"; }
      #         bind "Ctrl q" { Quit; }
      #     }
      #     shared_among "locked" {
      #         bind "Alt h" "Alt Left" { MoveFocusOrTab "Left"; }
      #         bind "Alt l" "Alt Right" { MoveFocusOrTab "Right"; }
      #         bind "Alt j" "Alt Down" { MoveFocus "Down"; }
      #         bind "Alt k" "Alt Up" { MoveFocus "Up"; }
      #         bind "Alt =" "Alt +" { Resize "Increase"; }
      #         bind "Alt -" { Resize "Decrease"; }
      #         bind "Alt [" { PreviousSwapLayout; }
      #         bind "Alt ]" { NextSwapLayout; }
      #         bind "Alt n" { NewPane; }
      #     }
      # }
      keybinds = {
        # shared_except = "normal" "locked" {
        #     bind "Enter" "Esc" { SwitchToMode "Normal"; }
        # }
        # shared_except "pane" "locked" {
        #     bind "Ctrl p" { SwitchToMode "Pane"; }
        # }
        # shared_except "resize" "locked" {
        #     bind "Ctrl n" { SwitchToMode "Resize"; }
        # }
        # shared_except "scroll" "locked" {
        #     bind "Ctrl s" { SwitchToMode "Scroll"; }
        # }
        # shared_except "session" "locked" {
        #     bind "Ctrl o" { SwitchToMode "Session"; }
        # }
        # shared_except "tab" "locked" {
        #     bind "Ctrl t" { SwitchToMode "Tab"; }
        # }
        # shared_except "move" "locked" {
        #     bind "Ctrl h" { SwitchToMode "Move"; }
        # }
        # shared_except "tmux" "locked" {
        #     bind "Ctrl b" { SwitchToMode "Tmux"; }
        # }
      };

      plugins = {
        tab-bar.path = "tab-bar";
        status-bar.path = "status-bar";
        strider.path = "strider";
        compact-bar.path = "compact-bar";
      };

      on_force_close = "quit";
      theme = "catppuccin-mocha";
      default_mode = "locked";
      layout_dir = "~/.config/zellij/layouts";
      ui.pane_frames.rounded_corners = true;
      default_shell = "fish";
    };
  };

  programs.eza = {
    enable = true;
    git = true;
    icons = true;
  };

  programs.git = {
    enable = true;
    lfs.enable = true;

    userName = "Ivan Miles Piesh";
    userEmail = "ipiesh@skysound.com";

    # includes = [
    #   {
    #     # use diffrent email & name for work
    #     path = "~/work/.gitconfig";
    #     condition = "gitdir:~/work/";
    #   }
    # ];

    extraConfig = {
      init.defaultBranch = "main";
      push.autoSetupRemote = true;
      pull.rebase = true;
    };

    # signing = {
    #   key = "xxx";
    #   signByDefault = true;
    # };

    delta = {
      enable = true;
      options = {
        features = "side-by-side";
      };
    };

    aliases = {
      # common aliases
      br = "branch";
      co = "checkout";
      st = "status";
      ls = "log --pretty=format:\"%C(yellow)%h%Cred%d\\\\ %Creset%s%Cblue\\\\ [%cn]\" --decorate";
      ll = "log --pretty=format:\"%C(yellow)%h%Cred%d\\\\ %Creset%s%Cblue\\\\ [%cn]\" --decorate --numstat";
      cm = "commit -m";
      ca = "commit -am";
      dc = "diff --cached";
      amend = "commit --amend -m";

      # aliases for submodule
      update = "submodule update --init --recursive";
      foreach = "submodule foreach";
    };
  };

  programs.helix = {
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
      # KEYS
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
    languages = {
      language = [
        # SCLS STUB ###########################################
        {
          name = "stub";
          scope = "text.stub";
          file-types = [];
          shebangs = [];
          roots = [];
          auto-format = false;
          language-servers = ["scls"];
        }
        # GOLANG ###########################################
        {
          name = "go";
          auto-format = true;
          formatter.command = "goimports";
          language-servers = ["gopls" "typos" "scls"];
        }
        # RUST ###########################################
        {
          name = "rust";
        }
        # SQL ###########################################
        {
          name = "sql";
          language-servers = ["sql-langauge-server" "typos"];
        }
        # DOCKERFILE ####################################
        {
          name = "dockerfile";
          file-types = ["Dockerfile"];
          auto-format = true;
        }
        # NIX ####################################
        {
          name = "nix";
          formatter.command = "nixpkgs-fmt";
        }
        # MARKDOWN ####################################
        {
          name = "markdown";
          language-servers = ["markdown-oxide"];
        }
      ];
      # LANGUAGE SERVERS ################################
      # TYPOS ###########################################
      language-server.typos = {
        command = "typos-lsp";
      };
      # SIMPLE COMPLETION LANG SERVER ###################
      language-server.scls = {
        command = "simple-completion-language-server";
        config = {
          max_completion_items = 20; # set max completion results len for each group: words, snippets, unicode-input
          snippets_first = true; # completions will return before snippets by default
          feature_words = true; # enable completion by word
          feature_snippets = true; # enable snippets
          feature_unicode_input = true; # enable "unicode input"
          feature_paths = true; # enable path completion
        };
        environment = {
          # write logs to /tmp/completion.log
          RUST_LOG = "info,simple-completion-langauge-server=info";
          LOG_FILE = "/tmp/completion.log";
        };
      };
      # RUST LANG SERVER ####################################
      language-server.rust-analyzer.config.check = {
        command = "clippy";
      };
      # YAML LANG SERVER ####################################
      language-server.yaml-language-server = {
        config.yaml = {
          format.enable = true;
          validation = true;
          schema = {
            "https://taskfile.dev/schema.json" = "**/Taskfile.yml";
          };
        };
      };
    };
  };

  home.file.wezterm = {
    target = ".config/wezterm/wezterm.lua";
    text = ''
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
  }

  programs.fish = {
    enable = true;
    interactiveShellInit = ''
      set fish_greeting # Disable greeting
      export EDITOR="hx"
      export GOPRIVATE="gitlab.disney.com/skywalker-sound/*,gitlab.disney.com/skywalker-sound/libraries/golang/*"

      alias config='/usr/bin/git --git-dir=/Users/ipiesh/.cfg/.git/ --work-tree=/Users/ipiesh'

      fish_add_path "/opt/homebrew/bin/"

      ##Keep this at the end
      fzf --fish | source
      zoxide init fish | source
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
      t = "task";
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
