{pkgs, ...}: {
  services.sketchybar = {
    enable = true;
    extraPackages = [pkgs.jq];
  };
}
