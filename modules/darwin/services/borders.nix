{...}: {
  # add jankyborders as it's being called within aerospace on startup
  services.jankyborders = {
    enable = true;
    active_color = "0xffff69b4";
    inactive_color = "0xff000000";
    width = 10.0;
    hidpi = false;
    blacklist = [ "OpenWhispr" ];
  };
}
