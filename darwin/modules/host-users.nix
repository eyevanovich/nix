{pkgs, username, ...}:
#############################################################
#
#  Host & Users configuration
#
#############################################################
{
  # Define a user account. Don't forget to set a password with ‘passwd’.
  users.users."${username}" = {
    home = "/Users/${username}";
    description = username;
    shell = pkgs.fish;
  };

  nix.settings.trusted-users = [username];
}
