{...}: {
  programs.delta = {
    enableGitIntegration = true;
    enable = true;
    options = {
      features = "side-by-side";
    };
  };

  programs.git = {
    enable = true;
    lfs.enable = true;

    # extraConfig = {
    # };

    ignores = [
      ".DS_Store"
    ];

    settings = {
      init.defaultBranch = "main";
      push.autoSetupRemote = true;
      pull.rebase = true;
      user.name = "Ivan Miles Piesh";
      user.email = "ipiesh@skysound.com";

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
    };
  };
}
