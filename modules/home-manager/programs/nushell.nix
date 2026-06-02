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
      def jn [name: string] { zellij --session $name --new-session-with-layout hx }
    '';
    plugins = [
      pkgs.nushellPlugins.gstat
      pkgs.nushellPlugins.formats
      # semver: nu_plugin_skim 0.27.0 in nixpkgs is compiled for nushell 0.112.1, incompatible with nushell 0.113.0 — re-enable once upstream syncs
      # pkgs.nushellPlugins.skim
    ];
  };
}
