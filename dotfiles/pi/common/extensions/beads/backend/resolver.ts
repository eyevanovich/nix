import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { TaskAdapter, TaskAdapterCapability } from "./api.ts";
import beadsAdapter from "./adapters/beads.ts";

export function checkAdapterCapability(cwd: string): TaskAdapterCapability {
  return beadsAdapter.checkCapability(cwd);
}

export async function openTaskBrowserWhenAvailable(
  ctx: Pick<ExtensionContext, "mode" | "cwd" | "ui">,
  openBrowser: () => Promise<void>,
  checkCapability: (cwd: string) => TaskAdapterCapability = checkAdapterCapability
): Promise<void> {
  if (ctx.mode !== "tui") {
    if (ctx.mode === "rpc") {
      ctx.ui.notify("The Beads task browser is available only in Pi TUI mode.", "warning");
    }
    return;
  }

  const capability = checkCapability(ctx.cwd);
  if (capability.kind !== "ready") {
    ctx.ui.notify(capability.message, "warning");
    return;
  }

  await openBrowser();
}

export default function initializeAdapter(pi: ExtensionAPI): TaskAdapter {
  return beadsAdapter.initialize(pi);
}
