{...}: {
  programs.atuin = {
    enable = true;
    enableFishIntegration = false; # manual init in fish.nix for ordering control
    settings = {
      auto_sync = false;
      update_check = true;
      enter_accept = false;
      sync.records = true;
      theme.name = "marine";
    };
  };
}
