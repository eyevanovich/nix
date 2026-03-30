{profile, lib, ...}: {
  programs.claude-code = {
    enable = true;

    mcpServers = lib.optionalAttrs (profile == "personal") {
      context7 = {
        command = "npx";
        args = ["-y" "@upstash/context7-mcp@latest"];
      };
    };
  };
}
