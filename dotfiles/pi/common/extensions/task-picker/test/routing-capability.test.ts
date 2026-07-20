import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { TrackerBackend, TrackerDetection, TrackerProvider } from "../backend/api.ts";
import {
  combinedProviderDiagnostic,
  detectProviders,
  openExplicitTaskBrowser,
  openResolvedTaskBrowser,
} from "../backend/resolver.ts";
import {
  createBeadsProvider,
  resolveRepositoryIdentity,
} from "../backend/providers/beads.ts";
import {
  buildListPrimaryHelpText,
  resolveListIntent,
  type ListControllerState,
} from "../controllers/list.ts";
import { KeybindingsManager, TUI_KEYBINDINGS } from "@earendil-works/pi-tui";
import registerExtension from "../extension.ts";

function provider(id: string, detection: TrackerDetection): TrackerProvider {
  return {
    id,
    label: id.toUpperCase(),
    promptPaths: [],
    detect: async () => detection,
    connect: async () => {
      throw new Error("not used");
    },
  };
}

function context(cwd = "/repo/nested") {
  const notifications: Array<{ message: string; level: string }> = [];
  return {
    value: {
      mode: "tui" as const,
      cwd,
      ui: {
        notify(message: string, level: string) {
          notifications.push({ message, level });
        },
      },
    },
    notifications,
  };
}

const ready: TrackerDetection = {
  kind: "ready",
  repository: { root: "/repo", canonicalId: "/repo" },
};

test("neutral resolver opens the sole ready provider and passes nested cwd", async () => {
  const seenCwds: string[] = [];
  const beads = provider("beads", ready);
  beads.detect = async (cwd) => {
    seenCwds.push(cwd);
    return ready;
  };
  const unavailable = provider("other", {
    kind: "unavailable",
    message: "other CLI missing",
  });
  const runtime = context();
  const opened: string[] = [];

  await openResolvedTaskBrowser(
    runtime.value as Parameters<typeof openResolvedTaskBrowser>[0],
    [beads, unavailable],
    async (selected) => {
      opened.push(selected.id);
    }
  );

  assert.deepEqual(seenCwds, ["/repo/nested"]);
  assert.deepEqual(opened, ["beads"]);
  assert.deepEqual(runtime.notifications, []);
});

test("neutral resolver combines diagnostics when no provider is ready", async () => {
  const resolutions = await detectProviders(
    [
      provider("beads", { kind: "not-applicable", message: "no .beads workspace" }),
      provider("other", { kind: "unavailable", message: "other CLI missing" }),
    ],
    "/repo"
  );

  assert.equal(
    combinedProviderDiagnostic(resolutions),
    "BEADS: no .beads workspace\nOTHER: other CLI missing"
  );
});

test("one provider detection failure does not suppress another ready provider", async () => {
  const broken = provider("broken", ready);
  broken.detect = async () => {
    throw new Error("probe crashed");
  };
  const working = provider("beads", ready);
  const runtime = context();
  const opened: string[] = [];

  await openResolvedTaskBrowser(
    runtime.value as Parameters<typeof openResolvedTaskBrowser>[0],
    [broken, working],
    async (selected) => {
      opened.push(selected.id);
    }
  );

  assert.deepEqual(opened, ["beads"]);
});

test("repository identity resolves a nested working directory through git argv", () => {
  const calls: Array<{ cwd: string }> = [];
  const identity = resolveRepositoryIdentity("/repo/nested/deeper", {
    resolveGitRoot(cwd) {
      calls.push({ cwd });
      return { status: 0, stdout: "/repo\n" };
    },
  });

  assert.deepEqual(calls, [{ cwd: "/repo/nested/deeper" }]);
  assert.deepEqual(identity, { root: "/repo", canonicalId: "/repo" });
});

test("Beads remains available in a non-Git workspace", async () => {
  const checked: string[] = [];
  const beads = createBeadsProvider({} as ExtensionAPI, [], {
    resolveGitRoot: () => ({ status: 128, stderr: "not a git repository" }),
    checkCapability(cwd) {
      checked.push(cwd);
      return { kind: "ready" };
    },
  });

  assert.deepEqual(await beads.detect("/workspace"), {
    kind: "ready",
    repository: { root: "/workspace", canonicalId: "/workspace" },
  });
  assert.deepEqual(checked, ["/workspace"]);
});

test("ready-provider browser failures are reported without rejecting", async () => {
  const runtime = context();
  const beads = provider("beads", ready);

  await openResolvedTaskBrowser(
    runtime.value as Parameters<typeof openResolvedTaskBrowser>[0],
    [beads],
    async () => {
      throw new Error("connect failed");
    }
  );
  await openExplicitTaskBrowser(
    runtime.value as Parameters<typeof openExplicitTaskBrowser>[0],
    beads,
    async () => {
      throw new Error("explicit connect failed");
    }
  );

  assert.deepEqual(runtime.notifications, [
    { message: "connect failed", level: "error" },
    { message: "explicit connect failed", level: "error" },
  ]);
});

test("Beads backend emits the exact compatibility execution request", async () => {
  const pi = { exec: async () => ({ code: 0, stdout: "", stderr: "" }) } as unknown as ExtensionAPI;
  const beads = createBeadsProvider(pi, ["/prompts"], {
    resolveGitRoot: () => ({ status: 0, stdout: "/repo" }),
  });
  const backend: TrackerBackend = await beads.connect("/repo/nested");

  assert.deepEqual(await backend.actions.startWork({ ref: "nix-123", title: "Task", status: "open" }), {
    prompt: "/execute-beads nix-123",
  });
});

test("Beads backend scopes commands to the resolved repository root", async () => {
  const options: unknown[] = [];
  const pi = {
    exec: async (_command: string, _args: string[], commandOptions: unknown) => {
      options.push(commandOptions);
      return { code: 0, stdout: "[]", stderr: "" };
    },
  } as unknown as ExtensionAPI;
  const beads = createBeadsProvider(pi, [], {
    resolveGitRoot: () => ({ status: 0, stdout: "/repo" }),
  });
  const backend = await beads.connect("/repo/nested");

  await backend.actions.changeStatus?.("nix-123", "closed");

  assert.deepEqual(options, [{ timeout: 30_000, cwd: "/repo" }]);
});

test("extension registers explicit tracker commands and discovers both bundled workflows once", () => {
  const commands: string[] = [];
  let discover: (() => { promptPaths: string[] }) | undefined;
  const pi = {
    on(event: string, handler: () => { promptPaths: string[] }) {
      if (event === "resources_discover") discover = handler;
    },
    registerCommand(name: string) {
      commands.push(name);
    },
    registerShortcut() {},
  } as unknown as ExtensionAPI;

  registerExtension(pi);

  assert.deepEqual(commands, ["tasks", "beads-tasks", "gitlab-issues"]);
  const promptPaths = discover?.().promptPaths ?? [];
  assert.equal(promptPaths.length, 1);
  assert.match(promptPaths[0] ?? "", /task-picker\/prompts$/);
});

test("unsupported list mutations are absent from handling and help", () => {
  const state: ListControllerState = {
    searching: false,
    filtered: false,
    allowSearch: true,
    allowPriority: false,
    allowEdit: false,
    allowStatus: false,
    allowTaskType: false,
    allowCreate: false,
    closeKey: "x",
    priorities: [],
    keybindings: new KeybindingsManager(TUI_KEYBINDINGS),
  };

  for (const key of ["0", " ", "t", "c", "e"]) {
    assert.deepEqual(resolveListIntent(key, state), { type: "delegate" });
  }
  assert.doesNotMatch(buildListPrimaryHelpText(state), /priority|edit|type|create/);
});
