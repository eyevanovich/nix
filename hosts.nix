# Host configurations
#
# This file defines the different host configurations for your machines.
# Each entry represents a separate machine with its specific settings.
 
{
  # Format:
  # "hostname" = {
  #   username = "your-username";  # Optional: defaults to global defaultUsername if not specified
  #   system = "architecture";     # Either "aarch64-darwin" (Apple Silicon) or "x86_64-darwin" (Intel)
  # };

  "hackbox2000" = {
    system = "aarch64-darwin";
  };

  "WFH-DEV-MBPX-PIESH" = {
    system = "aarch64-darwin";
  };

  # Example of an Intel Mac with Username override
  # "old-mac-mini" = {
  #   username = "different-user";  # Override the default username
  #   system = "x86_64-darwin";
  # };
}
