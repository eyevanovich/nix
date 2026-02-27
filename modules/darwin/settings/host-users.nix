{
  pkgs,
  username,
  hostname,
  uid,
  ...
}:
#############################################################
#
#  Host & Users configuration
#
#############################################################
{
  networking.hostName = hostname;
  networking.computerName = hostname;
  system.defaults.smb.NetBIOSName = hostname;
  system.primaryUser = "${username}";

  # Define a user account. Don't forget to set a password with ‘passwd’.
  users.knownUsers = ["${username}"];
  users.users."${username}" = {
    uid = uid;
    home = "/Users/${username}";
    description = username;
    shell = pkgs.fish;
  };

  nix.settings.trusted-users = [username];
}
