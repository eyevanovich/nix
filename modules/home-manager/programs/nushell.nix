{pkgs, ...}: {
  programs.nushell = {
    enable = true;
    environmentVariables = {
      EDITOR = "hx";
    };
    settings = {
      show_banner = false;
      completions.external = {
        enable = true;
        max_results = 200;
      };
      keybindings = [
        {
          name = "atuin_search";
          modifier = "control";
          keycode = "char_r";
          mode = ["emacs" "vi_normal" "vi_insert"];
          event = {
            send = "executehostcommand";
            cmd = "atuin search";
          };
        }
      ];
    };
    shellAliases = {
      ls = "eza -lAF";
      g = "git";
      m = "make";
      t = "task";
      lg = "lazygit";
      j = "zellij -l welcome";
    };
    extraConfig = ''
      $env.PATH = ($env.PATH | split row (char esep) | append "/opt/homebrew/bin" | str join (char esep))
      def .. [] { cd .. }
      def ... [] { cd ../.. }
    '';
    plugins = [
      pkgs.nushellPlugins.gstat
      pkgs.nushellPlugins.skim
      pkgs.nushellPlugins.formats
      pkgs.nushellPlugins.semver
    ];
  };
}
