import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Helper to load Litellm configuration dynamically from pi directories
function getLitellmConfig() {
  const home = os.homedir();
  
  let url = process.env.LITELLM_URL || "http://localhost:4000";
  try {
    const urlPath = path.join(home, ".pi", "agent", "litellm-base-url");
    if (fs.existsSync(urlPath)) {
      url = fs.readFileSync(urlPath, "utf-8").trim();
    }
  } catch (e) {}

  let apiKey = process.env.LITELLM_API_KEY || "sk-...";
  try {
    const authPath = path.join(home, ".pi", "agent", "auth.json");
    if (fs.existsSync(authPath)) {
      const authData = JSON.parse(fs.readFileSync(authPath, "utf-8"));
      if (authData?.litellm?.key) {
        apiKey = authData.litellm.key;
      }
    }
  } catch (e) {}

  // Litellm's /key/info endpoint usually accepts the actual API key string
  const targetKey = process.env.LITELLM_TARGET_KEY || apiKey;
  
  return { url, apiKey, targetKey };
}

// Polling interval in milliseconds (e.g., 5 minutes)
const POLL_INTERVAL = 5 * 60 * 1000;

export default function (pi: ExtensionAPI) {
  let interval: NodeJS.Timeout | null = null;

  async function updateSpendStatus(ctx: any) {
    if (!ctx.hasUI) return;

    try {
      const { url, apiKey } = getLitellmConfig();

      // Litellm `/key/info` endpoint
      // Uses x-litellm-api-key for auth, but doesn't need the key in the query string 
      // when we're requesting info about our own key
      const response = await fetch(`${url}/key/info`, {
        headers: {
          "x-litellm-api-key": apiKey,
          "accept": "application/json"
        }
      });

      if (!response.ok) {
        ctx.ui.setStatus("litellm-spend", "LiteLLM Spend: Error");
        return;
      }

      const data = await response.json();
      
      // Extract spend value (adjust this path to match Litellm's exact response structure)
      // Usually it's something like data.info.spend
      const spend = data?.info?.spend ?? data?.spend ?? 0;
      const limit = data?.info?.max_budget ?? data?.max_budget ?? 0;
      
      const formattedSpend = Number(spend).toFixed(4);
      const text = limit > 0 
        ? `LiteLLM Spend: $${formattedSpend} / $${limit}` 
        : `LiteLLM Spend: $${formattedSpend}`;
        
      ctx.ui.setStatus("litellm-spend", text);
    } catch (error) {
      // Fail silently or set error state so we don't spam the console
      ctx.ui.setStatus("litellm-spend", "LiteLLM Spend: Offline");
    }
  }

  // Initial fetch and start interval when session starts
  pi.on("session_start", async (_event, ctx) => {
    // Initial fetch
    await updateSpendStatus(ctx);

    // Set up polling (fallback)
    if (interval) clearInterval(interval);
    interval = setInterval(() => {
      updateSpendStatus(ctx);
    }, POLL_INTERVAL);
  });

  // Update on agent_end (after every full interaction finishes)
  pi.on("agent_end", async (_event, ctx) => {
    await updateSpendStatus(ctx);
  });

  // Cleanup when session closes
  pi.on("session_shutdown", async () => {
    if (interval) clearInterval(interval);
  });
  
  // Optional: add a command to manually refresh
  pi.registerCommand("refresh-spend", {
    description: "Refresh LiteLLM spend status",
    handler: async (args, ctx) => {
      ctx.ui.notify("Refreshing LiteLLM spend...", "info");
      await updateSpendStatus(ctx);
    }
  });
}
