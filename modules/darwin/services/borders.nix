{...}: {
  # add jankyborders as it's being called within aerospace on startup
  services.jankyborders = {
    enable = true;
    active_color = "0xff00ffff";
    inactive_color = "0xffff0000";
    width = 3.0;
    hidpi = "off";
  };
}
