{profile, lib, ...}: {
  programs.opencode = {
    enable = true;

    settings = lib.optionalAttrs (profile == "personal") {
      mcp = {
        context7 = {
          type = "local";
          command = ["npx" "-y" "@upstash/context7-mcp@latest"];
        };
        engram = {
          type = "local";
          command = ["engram" "mcp"];
        };
      };
    };
  };
}
