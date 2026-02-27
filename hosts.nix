# Host configurations
#
# This file defines the different host configurations for your machines.
# Each entry represents a separate machine with its specific settings.
{
  # Format:
  # "hostname" = {
  #   username = "your-username";  # Optional: defaults to global defaultUsername if not specified
  #   system = "architecture";     # Either "aarch64-darwin" (Apple Silicon) or "x86_64-darwin" (Intel)
  #   profile = "personal|work";   # Optional: defaults to "personal" if not specified
  #   uid = 501;                   # Optional: macOS user ID (run `id -u` to find yours), defaults to 501
  # };

  "hackbox2000" = {
    system = "aarch64-darwin";
    profile = "personal";
    uid = 501;
  };

  "WFH-DEV-MBPX-PIESH" = {
    system = "aarch64-darwin";
    profile = "work";
    uid = 501;
  };

  "WFH-DEV-MBAX-PIESH" = {
    system = "aarch64-darwin";
    profile = "work";
    uid = 501;
  };

  "DEV-MBPX-PIESH" = {
    system = "aarch64-darwin";
    profile = "work";
    uid = 503;
  };
}
