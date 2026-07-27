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
import registerExtension, { dispatchTaskWork } from "../extension.ts";
import type { WorkRunner } from "../work-runner/types.ts";

function provider(id: string, detection: TrackerDetection): TrackerProvider {
  return {
    id,
    label: id === "gitlab" ? "GitLab" : id === "beads" ? "Beads" : id.toUpperCase(),
    promptPaths: [],
    detect: async () => detection,
    connect: async () => {
      throw new Error("not used");
    },
  };
}

function context(cwd = "/repo/nested", selections: Array<string | undefined> = []) {
  const notifications: Array<{ message: string; level: string }> = [];
  const selects: Array<{ title: string; choices: string[] }> = [];
  return {
    value: {
      mode: "tui" as const,
      cwd,
      ui: {
        notify(message: string, level: string) {
          notifications.push({ message, level });
        },
        async select(title: string, choices: string[]) {
          selects.push({ title, choices });
          return selections.shift();
        },
      },
    },
    notifications,
    selects,
  };
}

function readyAt(root: string, canonicalId = root): TrackerDetection {
  return { kind: "ready", repository: { root, canonicalId } };
}

const ready = readyAt("/repo");

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
  assert.deepEqual(runtime.selects, []);
  assert.deepEqual(runtime.notifications, []);
});

test("neutral resolver opens GitLab directly when it is the sole ready provider", async () => {
  const runtime = context();
  const opened: string[] = [];

  await openResolvedTaskBrowser(
    runtime.value as Parameters<typeof openResolvedTaskBrowser>[0],
    [
      provider("beads", { kind: "not-applicable", message: "no .beads workspace" }),
      provider("gitlab", readyAt("/repo", "gitlab.example.com/group/project")),
    ],
    async ({ id }) => {
      opened.push(id);
    }
  );

  assert.deepEqual(opened, ["gitlab"]);
  assert.deepEqual(runtime.selects, []);
  assert.deepEqual(runtime.notifications, []);
});

test("neutral resolver reports combined diagnostics when no provider is ready", async () => {
  const runtime = context();
  const opened: string[] = [];

  await openResolvedTaskBrowser(
    runtime.value as Parameters<typeof openResolvedTaskBrowser>[0],
    [
      provider("beads", { kind: "not-applicable", message: "no .beads workspace" }),
      provider("gitlab", { kind: "unavailable", message: "glab auth required" }),
    ],
    async ({ id }) => {
      opened.push(id);
    }
  );

  assert.deepEqual(opened, []);
  assert.deepEqual(runtime.selects, []);
  assert.deepEqual(runtime.notifications, [
    {
      message: "Beads: no .beads workspace\nGitLab: glab auth required",
      level: "warning",
    },
  ]);
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
    "Beads: no .beads workspace\nOTHER: other CLI missing"
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
  assert.deepEqual(runtime.selects, []);
});

test("dual-tracker resolver chooses and remembers by normalized repository root", async () => {
  const memory = new Map<string, string>();
  const first = context("/repo/nested", ["GitLab"]);
  const second = context("/repo/other/nested");
  const opened: string[] = [];
  const trackers = [
    provider("beads", readyAt("/repo", "/repo")),
    provider("gitlab", readyAt("/repo/.", "gitlab.example.com/group/project")),
  ];
  const open = async ({ id }: TrackerProvider) => {
    opened.push(id);
  };

  await openResolvedTaskBrowser(
    first.value as Parameters<typeof openResolvedTaskBrowser>[0],
    trackers,
    open,
    memory
  );
  await openResolvedTaskBrowser(
    second.value as Parameters<typeof openResolvedTaskBrowser>[0],
    trackers,
    open,
    memory
  );

  assert.deepEqual(first.selects, [
    { title: "Choose task tracker", choices: ["Beads", "GitLab"] },
  ]);
  assert.deepEqual(second.selects, []);
  assert.deepEqual(opened, ["gitlab", "gitlab"]);
  assert.equal(memory.get("/repo"), "gitlab");
});

test("duplicate provider labels use unique options and route without first-match ambiguity", async () => {
  const memory = new Map<string, string>();
  const runtime = context("/repo/nested", ["Tracker (second)"]);
  const opened: string[] = [];
  const first = { ...provider("first", ready), label: "Tracker" };
  const second = { ...provider("second", ready), label: "Tracker" };

  await openResolvedTaskBrowser(
    runtime.value as Parameters<typeof openResolvedTaskBrowser>[0],
    [first, second],
    async ({ id }) => {
      opened.push(id);
    },
    memory
  );

  assert.deepEqual(runtime.selects, [
    { title: "Choose task tracker", choices: ["Tracker (first)", "Tracker (second)"] },
  ]);
  assert.deepEqual(opened, ["second"]);
  assert.equal(memory.get("/repo"), "second");
});

test("chooser display strings remain globally unique when generated labels collide", async () => {
  const trackers = [
    { ...provider("first", ready), label: "Tracker" },
    { ...provider("second", ready), label: "Tracker" },
    { ...provider("literal", ready), label: "Tracker (first)" },
  ];
  const choices = ["Tracker (first)", "Tracker (second)", "Tracker (first) [2]"];
  const opened: string[] = [];

  for (const [selection, expectedProvider] of [
    [choices[0], "first"],
    [choices[1], "second"],
    [choices[2], "literal"],
  ] as const) {
    const runtime = context("/repo/nested", [selection]);
    await openResolvedTaskBrowser(
      runtime.value as Parameters<typeof openResolvedTaskBrowser>[0],
      trackers,
      async ({ id }) => {
        opened.push(id);
      }
    );
    assert.deepEqual(runtime.selects, [
      { title: "Choose task tracker", choices },
    ]);
    assert.equal(opened.at(-1), expectedProvider);
  }

  assert.deepEqual(opened, ["first", "second", "literal"]);
});

test("dual-tracker chooser cancellation opens nothing and does not write memory", async () => {
  const memory = new Map<string, string>();
  const runtime = context("/repo", [undefined]);
  const opened: string[] = [];

  await openResolvedTaskBrowser(
    runtime.value as Parameters<typeof openResolvedTaskBrowser>[0],
    [provider("beads", ready), provider("gitlab", ready)],
    async ({ id }) => {
      opened.push(id);
    },
    memory
  );

  assert.deepEqual(runtime.selects, [
    { title: "Choose task tracker", choices: ["Beads", "GitLab"] },
  ]);
  assert.deepEqual(opened, []);
  assert.deepEqual(runtime.notifications, []);
  assert.equal(memory.size, 0);
});

test("an unknown remembered provider prompts again and replaces stale memory", async () => {
  const memory = new Map<string, string>([["/repo", "retired"]]);
  const runtime = context("/repo/nested", ["Beads"]);
  const opened: string[] = [];

  await openResolvedTaskBrowser(
    runtime.value as Parameters<typeof openResolvedTaskBrowser>[0],
    [provider("beads", ready), provider("gitlab", ready)],
    async ({ id }) => {
      opened.push(id);
    },
    memory
  );

  assert.deepEqual(runtime.selects, [
    { title: "Choose task tracker", choices: ["Beads", "GitLab"] },
  ]);
  assert.deepEqual(opened, ["beads"]);
  assert.equal(memory.get("/repo"), "beads");
});

test("tracker choices are isolated between repositories", async () => {
  const memory = new Map<string, string>();
  const opened: string[] = [];
  const open = async ({ id }: TrackerProvider) => {
    opened.push(id);
  };
  const providersFor = (root: string) => [
    provider("beads", readyAt(root)),
    provider("gitlab", readyAt(root, `gitlab.example.com${root}`)),
  ];
  const repoA = context("/repo-a/nested", ["Beads"]);
  const repoB = context("/repo-b/nested", ["GitLab"]);

  await openResolvedTaskBrowser(
    repoA.value as Parameters<typeof openResolvedTaskBrowser>[0],
    providersFor("/repo-a"),
    open,
    memory
  );
  await openResolvedTaskBrowser(
    repoB.value as Parameters<typeof openResolvedTaskBrowser>[0],
    providersFor("/repo-b"),
    open,
    memory
  );

  assert.deepEqual(opened, ["beads", "gitlab"]);
  assert.equal(memory.get("/repo-a"), "beads");
  assert.equal(memory.get("/repo-b"), "gitlab");
  assert.equal(repoA.selects.length, 1);
  assert.equal(repoB.selects.length, 1);
});

test("distinct ready roots prompt every time and never store a repository choice", async () => {
  const memory = new Map<string, string>();
  const first = context("/repo-a/nested", ["Beads"]);
  const second = context("/repo-a/nested", ["GitLab"]);
  const opened: string[] = [];
  const trackers = [
    provider("beads", readyAt("/repo-a")),
    provider("gitlab", readyAt("/repo-b", "gitlab.example.com/group/project")),
  ];
  const open = async ({ id }: TrackerProvider) => {
    opened.push(id);
  };

  await openResolvedTaskBrowser(
    first.value as Parameters<typeof openResolvedTaskBrowser>[0],
    trackers,
    open,
    memory
  );
  await openResolvedTaskBrowser(
    second.value as Parameters<typeof openResolvedTaskBrowser>[0],
    trackers,
    open,
    memory
  );

  assert.deepEqual(first.selects, [
    { title: "Choose task tracker", choices: ["Beads", "GitLab"] },
  ]);
  assert.deepEqual(second.selects, [
    { title: "Choose task tracker", choices: ["Beads", "GitLab"] },
  ]);
  assert.deepEqual(opened, ["beads", "gitlab"]);
  assert.equal(memory.size, 0);
});

test("a stale remembered provider does not override the current sole ready provider", async () => {
  const memory = new Map<string, string>([["/repo", "gitlab"]]);
  const runtime = context("/repo/nested", ["GitLab"]);
  const opened: string[] = [];

  await openResolvedTaskBrowser(
    runtime.value as Parameters<typeof openResolvedTaskBrowser>[0],
    [
      provider("beads", ready),
      provider("gitlab", { kind: "unavailable", message: "network unavailable" }),
    ],
    async ({ id }) => {
      opened.push(id);
    },
    memory
  );

  assert.deepEqual(opened, ["beads"]);
  assert.deepEqual(runtime.selects, []);
  assert.equal(memory.get("/repo"), "gitlab");
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

test("work-runner fallback dispatches expanded bundled workflows", async () => {
  const workRunner: WorkRunner = {
    start: async () => ({ kind: "fallback" }),
  };
  const cases = [
    {
      providerId: "beads",
      ref: "nix-123",
      prompt: "/execute-beads nix-123",
      target: /Target override: `nix-123`/,
      workflow: /Goal: the parent owns scope, approval, integration/,
    },
    {
      providerId: "gitlab",
      ref: "gitlab.example\/group\/project#3",
      prompt: "/execute-gitlab-issue https://gitlab.example/group/project/-/issues/3",
      target: /Target: `https:\/\/gitlab\.example\/group\/project\/-\/issues\/3`/,
      workflow: /Goal: the parent owns exact issue resolution, scope, approval/,
    },
  ];

  for (const item of cases) {
    const sent: string[] = [];
    const result = await dispatchTaskWork(
      workRunner,
      {
        providerId: item.providerId,
        task: { ref: item.ref, title: "Task", status: "open" },
        execution: { prompt: item.prompt },
        cwd: "/repo",
      },
      (message) => sent.push(message)
    );

    assert.deepEqual(result, { kind: "fallback" });
    assert.equal(sent.length, 1);
    assert.doesNotMatch(sent[0]!, /^\//);
    assert.match(sent[0]!, item.target);
    assert.match(sent[0]!, item.workflow);
  }
});

test("launched work-runner path does not dispatch in the parent session", async () => {
  const sent: string[] = [];
  const workRunner: WorkRunner = {
    start: async (input) => ({
      kind: "launched",
      recordPath: "/state/run.json",
      record: {
        version: 1,
        id: "run",
        providerId: input.providerId,
        taskRef: input.task.ref,
        primaryRoot: "/repo",
        prompt: input.execution.prompt,
        branch: "task-picker/run",
        phase: "launched",
        createdAt: "2026-07-20T00:00:00Z",
        updatedAt: "2026-07-20T00:00:00Z",
        leaseAttempted: true,
        leasePath: "/pool/run",
      },
    }),
  };

  const result = await dispatchTaskWork(
    workRunner,
    {
      providerId: "gitlab",
      task: { ref: "project#1", title: "Task", status: "open" },
      execution: { prompt: "/execute-gitlab-issue https://example/project/-/issues/1" },
      cwd: "/repo",
    },
    (message) => sent.push(message)
  );

  assert.equal(result.kind, "launched");
  assert.deepEqual(sent, []);
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

test("ctrl+e chooses once and reuses session memory in one extension instance", async () => {
  type ShortcutHandler = (ctx: unknown) => Promise<void>;
  let shortcutName: string | undefined;
  let shortcutHandler: ShortcutHandler | undefined;
  const connected: string[] = [];
  const trackers = [provider("beads", ready), provider("gitlab", ready)];
  for (const tracker of trackers) {
    tracker.connect = async () => {
      connected.push(tracker.id);
      throw new Error(`${tracker.id} browser stopped for test`);
    };
  }
  const pi = {
    on() {},
    registerCommand() {},
    registerShortcut(name: string, options: { handler: ShortcutHandler }) {
      shortcutName = name;
      shortcutHandler = options.handler;
    },
  } as unknown as ExtensionAPI;
  registerExtension(pi, { providers: trackers });
  const runtime = context("/repo/nested", ["GitLab"]);

  await shortcutHandler?.(runtime.value);
  await shortcutHandler?.(runtime.value);

  assert.equal(shortcutName, "ctrl+e");
  assert.deepEqual(connected, ["gitlab", "gitlab"]);
  assert.deepEqual(runtime.selects, [
    { title: "Choose task tracker", choices: ["Beads", "GitLab"] },
  ]);
});

test("explicit tracker commands bypass and do not alter chooser memory", async () => {
  type CommandHandler = (rawArgs: string, ctx: unknown) => Promise<void>;
  const handlers = new Map<string, CommandHandler>();
  const connected: string[] = [];
  const trackers = [provider("beads", ready), provider("gitlab", ready)];
  for (const tracker of trackers) {
    tracker.connect = async () => {
      connected.push(tracker.id);
      throw new Error(`${tracker.id} browser stopped for test`);
    };
  }
  const pi = {
    on() {},
    registerCommand(name: string, options: { handler: CommandHandler }) {
      handlers.set(name, options.handler);
    },
    registerShortcut() {},
  } as unknown as ExtensionAPI;
  registerExtension(pi, { providers: trackers });
  const runtime = context("/repo/nested", ["Beads"]);
  const ctx = runtime.value as Parameters<CommandHandler>[1];

  await handlers.get("tasks")?.("", ctx);
  await handlers.get("gitlab-issues")?.("", ctx);
  await handlers.get("beads-tasks")?.("", ctx);
  await handlers.get("tasks")?.("", ctx);

  assert.deepEqual(connected, ["beads", "gitlab", "beads", "beads"]);
  assert.deepEqual(runtime.selects, [
    { title: "Choose task tracker", choices: ["Beads", "GitLab"] },
  ]);
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
