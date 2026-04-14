{
  profile,
  lib,
  ...
}: {
  programs.opencode = {
    enable = true;

    settings = lib.optionalAttrs (profile == "personal") {
      provider = {
        lmstudio = {
          npm = "@ai-sdk/openai-compatible";
          name = "LM Studio (local)";
          options = {
            baseURL = "http://localhost:1234/v1";
          };
          models = {
            "google/gemma-4-26b-a4b" = {
              name = "gemma-4-26b-a4b";
            };
            "zai-org/glm-4.7-flash" = {
              name = "glm-4.7-flash";
            };
          };
        };
      };
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
