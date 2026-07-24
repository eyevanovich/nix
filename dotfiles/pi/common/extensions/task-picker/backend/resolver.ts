import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { resolve } from "node:path";
import type {
  TaskAdapterCapability,
  TrackerDetection,
  TrackerProvider,
} from "./api.ts";

export interface ProviderResolution {
  provider: TrackerProvider;
  detection: TrackerDetection;
}

export interface TrackerChoiceMemory {
  get(repositoryKey: string): string | undefined;
  set(repositoryKey: string, providerId: string): void;
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
  openBrowser: (provider: TrackerProvider) => Promise<void>,
  choiceMemory?: TrackerChoiceMemory
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
    const roots = new Set(ready.map(({ detection }) => resolve(detection.repository.root)));
    const repositoryKey = roots.size === 1 ? roots.values().next().value : undefined;
    const rememberedId = repositoryKey ? choiceMemory?.get(repositoryKey) : undefined;
    let selected = rememberedId
      ? ready.find(({ provider }) => provider.id === rememberedId)
      : undefined;

    if (!selected) {
      const labelCounts = new Map<string, number>();
      for (const { provider } of ready) {
        labelCounts.set(provider.label, (labelCounts.get(provider.label) ?? 0) + 1);
      }
      const usedDisplays = new Set<string>();
      const options = ready.map((resolution) => {
        const baseDisplay = labelCounts.get(resolution.provider.label) === 1
          ? resolution.provider.label
          : `${resolution.provider.label} (${resolution.provider.id})`;
        let display = baseDisplay;
        let suffix = 2;
        while (usedDisplays.has(display)) {
          display = `${baseDisplay} [${suffix}]`;
          suffix += 1;
        }
        usedDisplays.add(display);
        return { resolution, display };
      });
      const display = await ctx.ui.select(
        "Choose task tracker",
        options.map((option) => option.display)
      );
      if (!display) return;
      selected = options.find((option) => option.display === display)?.resolution;
      if (!selected) return;
      if (repositoryKey) choiceMemory?.set(repositoryKey, selected.provider.id);
    }

    try {
      await openBrowser(selected.provider);
    } catch (error) {
      ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
    }
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
