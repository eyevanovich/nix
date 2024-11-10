{...}: {
  # add jankyborders as it's being called within aerospace on startup
  services.jankyborders = {
    enable = true;
    active_color = "0xffffd700";
    inactive_color = "0xff000000";
    width = 3.0;
    hidpi = false;
  };
}
