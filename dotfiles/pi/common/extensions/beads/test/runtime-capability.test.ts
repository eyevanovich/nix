import assert from "node:assert/strict";
import test from "node:test";
import type { TaskAdapterCapability } from "../backend/api.ts";
import { checkBeadsCapability } from "../backend/adapters/beads.ts";
import { openTaskBrowserWhenAvailable } from "../backend/resolver.ts";

interface RuntimeContextOptions {
  mode: "tui" | "rpc" | "json" | "print";
  cwd?: string;
}

function makeRuntime(capability: TaskAdapterCapability) {
  let browserCalls = 0;
  const capabilityCwds: string[] = [];
  const notifications: Array<{ message: string; level: string }> = [];

  function context({ mode, cwd = "/active/project" }: RuntimeContextOptions) {
    return {
      mode,
      cwd,
      ui: {
        notify(message: string, level: string) {
          notifications.push({ message, level });
        },
      },
    };
  }

  return {
    async run(options: RuntimeContextOptions) {
      await openTaskBrowserWhenAvailable(
        context(options) as Parameters<typeof openTaskBrowserWhenAvailable>[0],
        async () => {
          browserCalls += 1;
        },
        (cwd) => {
          capabilityCwds.push(cwd);
          return capability;
        }
      );
    },
    capabilityCwds,
    notifications,
    browserCalls: () => browserCalls,
  };
}

test("capability checks the requested workspace and ready CLI", () => {
  const workspacePaths: string[] = [];
  let cliChecks = 0;

  const capability = checkBeadsCapability("/active/project", {
    workspaceExists(path) {
      workspacePaths.push(path);
      return true;
    },
    checkCli() {
      cliChecks += 1;
      return { status: 0, stdout: "bd version 1.1.0" };
    },
  });

  assert.deepEqual(capability, { kind: "ready" });
  assert.deepEqual(workspacePaths, ["/active/project/.beads"]);
  assert.equal(cliChecks, 1);
});

test("missing workspace is actionable and skips the CLI check", () => {
  let cliChecks = 0;
  const capability = checkBeadsCapability("/uninitialized", {
    workspaceExists: () => false,
    checkCli() {
      cliChecks += 1;
      return { status: 0 };
    },
  });

  assert.equal(capability.kind, "missing-workspace");
  assert.match(capability.kind === "missing-workspace" ? capability.message : "", /bd init/);
  assert.equal(cliChecks, 0);
});

test("unavailable and failing CLI checks retain useful process detail", () => {
  const unavailable = checkBeadsCapability("/active/project", {
    workspaceExists: () => true,
    checkCli: () => ({ status: null, error: new Error("spawn bd ENOENT") }),
  });
  const failing = checkBeadsCapability("/active/project", {
    workspaceExists: () => true,
    checkCli: () => ({ status: 1, stderr: "version check failed" }),
  });

  assert.equal(unavailable.kind, "unavailable-cli");
  assert.match(unavailable.kind === "unavailable-cli" ? unavailable.message : "", /ENOENT/);
  assert.equal(failing.kind, "unavailable-cli");
  assert.match(failing.kind === "unavailable-cli" ? failing.message : "", /version check failed/);
});

test("ready TUI invocation checks ctx.cwd and opens the browser once", async () => {
  const runtime = makeRuntime({ kind: "ready" });

  await runtime.run({ mode: "tui", cwd: "/session/workspace" });

  assert.deepEqual(runtime.capabilityCwds, ["/session/workspace"]);
  assert.equal(runtime.browserCalls(), 1);
  assert.deepEqual(runtime.notifications, []);
});

test("missing workspace blocks browser work with one notification", async () => {
  const capability: TaskAdapterCapability = {
    kind: "missing-workspace",
    message: "Run bd init in this workspace.",
  };
  const runtime = makeRuntime(capability);

  await runtime.run({ mode: "tui" });

  assert.deepEqual(runtime.capabilityCwds, ["/active/project"]);
  assert.equal(runtime.browserCalls(), 0);
  assert.deepEqual(runtime.notifications, [
    { message: capability.message, level: "warning" },
  ]);
});

test("unavailable CLI blocks browser work with one notification", async () => {
  const capability: TaskAdapterCapability = {
    kind: "unavailable-cli",
    message: "Install bd or add it to PATH.",
  };
  const runtime = makeRuntime(capability);

  await runtime.run({ mode: "tui" });

  assert.equal(runtime.browserCalls(), 0);
  assert.deepEqual(runtime.notifications, [
    { message: capability.message, level: "warning" },
  ]);
});

test("RPC reports unsupported custom UI once without capability or browser work", async () => {
  const runtime = makeRuntime({ kind: "ready" });

  await runtime.run({ mode: "rpc" });

  assert.deepEqual(runtime.capabilityCwds, []);
  assert.equal(runtime.browserCalls(), 0);
  assert.equal(runtime.notifications.length, 1);
  assert.match(runtime.notifications[0]?.message ?? "", /only in Pi TUI mode/);
});

for (const mode of ["print", "json"] as const) {
  test(`${mode} mode returns without feedback, capability, or browser work`, async () => {
    const runtime = makeRuntime({ kind: "ready" });

    await runtime.run({ mode });

    assert.deepEqual(runtime.capabilityCwds, []);
    assert.equal(runtime.browserCalls(), 0);
    assert.deepEqual(runtime.notifications, []);
  });
}
