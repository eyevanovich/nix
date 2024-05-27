{pkgs, ...}: {
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
}
