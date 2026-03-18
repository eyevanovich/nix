{
  pkgs,
  lib,
  profile,
  ...
}: {
  programs.nushell = {
    enable = true;
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
    extraEnv = ''
      $env.EDITOR = "hx"
      $env.STARSHIP_CONFIG = $"($env.HOME)/.config/starship/starship.toml"
    '';
    extraConfig = ''
      $env.PATH = ($env.PATH | split row (char esep) | append "/opt/homebrew/bin" | str join (char esep))
      mkdir ~/.cache/starship
      starship init nu | save -f ~/.cache/starship/init.nu
      mkdir ~/.cache/zoxide
      zoxide init nushell | save -f ~/.cache/zoxide/init.nu
      mkdir ~/.cache/atuin
      mkdir ~/.local/share/atuin
      atuin init nu | save -f ~/.cache/atuin/init.nu    '';
    plugins = [
      pkgs.nushellPlugins.gstat
      pkgs.nushellPlugins.skim
      pkgs.nushellPlugins.formats
      pkgs.nushellPlugins.semver
    ];
  };
}
