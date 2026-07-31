{
  profile,
  lib,
  ...
}: {
  programs.delta = {
    enable = true;
    enableGitIntegration = true;
    options = {
      navigate = true;
      side-by-side = true;
      dark = true;
    };
  };

  programs.lazygit = {
    enable = true;
    settings.git.pagers = [
      {pager = "delta --dark --paging=never";}
    ];
  };

  programs.git = {
    enable = true;
    lfs.enable = true;

    # extraConfig = {
    # };

    signing =
      if profile == "personal"
      then {
        format = "ssh";
        key = "~/.ssh/id_ed25519_git_signing";
        signByDefault = true;
      }
      else {
        format = null;
      };

    includes = lib.optionals (profile == "work") [
      {path = "~/.config/git/local.conf";}
    ];

    ignores = [
      ".DS_Store"
    ];

    settings =
      {
        init.defaultBranch = "main";
        push.autoSetupRemote = true;
        pull.rebase = true;
        merge.conflictstyle = "zdiff3";
        user.name = "Ivan Miles Piesh";
        user.email =
          if profile == "work"
          then "ipiesh@skysound.com"
          else "ivan@ivanpiesh.info";

        alias = {
          # common aliases
          br = "branch";
          co = "checkout";
          st = "status";
          ls = "log --pretty=format:\"%C(yellow)%h%Cred%d\\\\ %Creset%s%Cblue\\\\ [%cn]\" --decorate";
          ll = "log --pretty=format:\"%C(yellow)%h%Cred%d\\\\ %Creset%s%Cblue\\\\ [%cn]\" --decorate --numstat";
          cm = "commit -m";
          ca = "commit -am";
          dc = "diff --cached";
          amend = "commit --amend -m";

          # aliases for submodule
          update = "submodule update --init --recursive";
          foreach = "submodule foreach";
        };
      }
      // lib.optionalAttrs (profile == "personal") {
        gpg.ssh.allowedSignersFile = "~/.ssh/git_allowed_signers";
      };
  };
}
