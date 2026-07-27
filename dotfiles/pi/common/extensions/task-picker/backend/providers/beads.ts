import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import beadsAdapter from "../adapters/beads.ts";
import type {
  RepositoryIdentity,
  TrackerBackend,
  TrackerDetection,
  TrackerProvider,
} from "../api.ts";

export interface BeadsProviderDependencies {
  resolveGitRoot(cwd: string): { status: number | null; stdout?: string; stderr?: string; error?: Error };
  checkCapability?: typeof beadsAdapter.checkCapability;
}

const DEFAULT_DEPENDENCIES: BeadsProviderDependencies = {
  resolveGitRoot: (cwd) => {
    const result = spawnSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
    });
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      error: result.error,
    };
  },
};

export function resolveRepositoryIdentity(
  cwd: string,
  dependencies: Pick<BeadsProviderDependencies, "resolveGitRoot"> = DEFAULT_DEPENDENCIES
): RepositoryIdentity | null {
  const result = dependencies.resolveGitRoot(cwd);
  if (result.error || result.status !== 0) return null;
  const root = result.stdout?.trim();
  if (!root) return null;
  const canonicalRoot = resolve(root);
  return { root: canonicalRoot, canonicalId: canonicalRoot };
}

export function createBeadsProvider(
  pi: ExtensionAPI,
  promptPaths: string[],
  dependencies: BeadsProviderDependencies = DEFAULT_DEPENDENCIES
): TrackerProvider {
  return {
    id: "beads",
    label: "Beads",
    promptPaths,

    async detect(cwd: string): Promise<TrackerDetection> {
      const repository = resolveRepositoryIdentity(cwd, dependencies) ?? {
        root: resolve(cwd),
        canonicalId: resolve(cwd),
      };
      const capability = (dependencies.checkCapability ?? beadsAdapter.checkCapability)(
        repository.root
      );
      if (capability.kind === "missing-workspace") {
        return { kind: "not-applicable", message: capability.message };
      }
      if (capability.kind === "unavailable-cli") {
        return { kind: "unavailable", message: capability.message };
      }

      return { kind: "ready", repository };
    },

    async connect(cwd: string): Promise<TrackerBackend> {
      const repository = resolveRepositoryIdentity(cwd, dependencies) ?? {
        root: resolve(cwd),
        canonicalId: resolve(cwd),
      };
      const adapter = beadsAdapter.initialize(pi, repository.root);

      return {
        id: "beads",
        label: "Beads",
        statusMap: adapter.statusMap,
        taskTypes: adapter.taskTypes,
        priorities: adapter.priorities,
        priorityHotkeys: adapter.priorityHotkeys,
        list: () => adapter.list(),
        show: (ref) => adapter.show(ref),
        invalidateCache: () => adapter.invalidateCache?.(),
        actions: {
          create: (input) => adapter.create(input),
          update: (ref, update) => adapter.update(ref, update),
          changeStatus: (ref, status) => adapter.update(ref, { status }),
          changePriority: (ref, priority) => adapter.update(ref, { priority }),
          changeTaskType: (ref, taskType) => adapter.update(ref, { taskType }),
          startWork: async (item) => ({ prompt: `/execute-beads ${item.id ?? item.ref}` }),
        },
      };
    },
  };
}
