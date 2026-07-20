import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type {
  TaskAdapterCapability,
  TrackerDetection,
  TrackerProvider,
} from "./api.ts";

export interface ProviderResolution {
  provider: TrackerProvider;
  detection: TrackerDetection;
}

export async function detectProviders(
  providers: readonly TrackerProvider[],
  cwd: string
): Promise<ProviderResolution[]> {
  return Promise.all(
    providers.map(async (provider) => {
      try {
        return { provider, detection: await provider.detect(cwd) };
      } catch (error) {
        const details = error instanceof Error ? error.message : String(error);
        return {
          provider,
          detection: {
            kind: "unavailable" as const,
            message: `${provider.label} detection failed: ${details}`,
          },
        };
      }
    })
  );
}

export function combinedProviderDiagnostic(resolutions: readonly ProviderResolution[]): string {
  if (resolutions.length === 0) return "No task tracker providers are registered.";
  return resolutions
    .map(({ provider, detection }) =>
      `${provider.label}: ${detection.kind === "ready" ? "ready" : detection.message}`
    )
    .join("\n");
}

function supportsInteractiveUi(ctx: Pick<ExtensionContext, "mode" | "ui">): boolean {
  if (ctx.mode === "tui") return true;
  if (ctx.mode === "rpc") {
    ctx.ui.notify("The task browser is available only in Pi TUI mode.", "warning");
  }
  return false;
}

export async function openResolvedTaskBrowser(
  ctx: Pick<ExtensionContext, "mode" | "cwd" | "ui">,
  providers: readonly TrackerProvider[],
  openBrowser: (provider: TrackerProvider) => Promise<void>
): Promise<void> {
  if (!supportsInteractiveUi(ctx)) return;

  const resolutions = await detectProviders(providers, ctx.cwd);
  const ready = resolutions.filter(
    (resolution): resolution is ProviderResolution & { detection: { kind: "ready" } } =>
      resolution.detection.kind === "ready"
  );

  if (ready.length === 1) {
    try {
      await openBrowser(ready[0].provider);
    } catch (error) {
      ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
    }
    return;
  }

  if (ready.length > 1) {
    ctx.ui.notify(
      "Multiple task trackers are available. Use an explicit tracker command.",
      "warning"
    );
    return;
  }

  ctx.ui.notify(combinedProviderDiagnostic(resolutions), "warning");
}

export async function openExplicitTaskBrowser(
  ctx: Pick<ExtensionContext, "mode" | "cwd" | "ui">,
  provider: TrackerProvider,
  openBrowser: (provider: TrackerProvider) => Promise<void>
): Promise<void> {
  if (!supportsInteractiveUi(ctx)) return;

  const [{ detection }] = await detectProviders([provider], ctx.cwd);
  if (detection.kind !== "ready") {
    ctx.ui.notify(detection.message, "warning");
    return;
  }
  try {
    await openBrowser(provider);
  } catch (error) {
    ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
  }
}

// Compatibility seam retained for focused Beads capability tests and callers.
export async function openTaskBrowserWhenAvailable(
  ctx: Pick<ExtensionContext, "mode" | "cwd" | "ui">,
  openBrowser: () => Promise<void>,
  checkCapability: (cwd: string) => TaskAdapterCapability
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
