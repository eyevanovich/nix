import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkRunnerWithDependencies } from "../work-runner/index.ts";
import type { CommandExecutor, CommandResult } from "../work-runner/types.ts";
import { isolatedWorkerInstructions, WORKER_PHASES } from "../work-runner/worker-instructions.ts";
import { readRunRecord, validateRunRecordPath } from "../work-runner/worker-policy.ts";
import type { TaskRunRecord } from "../work-runner/types.ts";

interface Call {
  command: string;
  args: string[];
  options?: { cwd?: string; timeout?: number };
}

const ok = (stdout = ""): CommandResult => ({ code: 0, stdout, stderr: "" });

function successfulExecutor(calls: Call[], overrides: Partial<Record<string, CommandResult>> = {}): CommandExecutor {
  return async (command, args, options) => {
    calls.push({ command, args, options });
    const key = `${command} ${args.join(" ")}`;
    if (overrides[key]) return overrides[key]!;
    if (command === "treehouse" && args.join(" ") === "get --help") return ok("--lease --lease-holder");
    if (command === "no-mistakes" && args.join(" ") === "axi run --help") return ok("--intent");
    if (command === "no-mistakes" && args.join(" ") === "axi respond --help") return ok("respond");
    if (command === "no-mistakes" && args.join(" ") === "axi") return ok("home");
    if (command === "pi" || (command === "zellij" && args[0] === "--version")) return ok("version");
    if (command === "zellij" && args.join(" ") === "action list-tabs --json") {
      return ok('[{"tab_id":2,"active":true,"name":"main"}]');
    }
    if (command === "git" && args.join(" ") === "-C /source rev-parse --show-toplevel") return ok("/repo\n");
    if (command === "treehouse" && args[0] === "get" && args[1] === "--lease") return ok("/pool/wt\n");
    if (command === "git" && args.join(" ") === "-C /pool/wt rev-parse --show-toplevel") return ok("/pool/wt\n");
    if (command === "git" && args.join(" ") === "-C /pool/wt rev-parse --absolute-git-dir") return ok("/repo/.git/worktrees/wt\n");
    if (command === "git" && args.join(" ") === "-C /pool/wt rev-parse --git-common-dir") return ok("/repo/.git\n");
    if (command === "git" && args.join(" ") === "-C /repo rev-parse --git-common-dir") return ok("/repo/.git\n");
    if (command === "git" && args.join(" ") === "-C /pool/wt status --porcelain") return ok();
    if (command === "git" && args.slice(0, 4).join(" ") === "-C /pool/wt switch -c") return ok();
    if (command === "zellij" && args[1] === "new-tab") return ok("7\n");
    if (command === "zellij" && args[1] === "list-panes") {
      const hasStatus = calls.some((call) => call.command === "zellij" && call.args[1] === "new-pane");
      return ok(hasStatus
        ? '[{"id":11,"tab_id":7,"is_plugin":false},{"id":12,"tab_id":7,"is_plugin":false}]'
        : '[{"id":11,"tab_id":7,"is_plugin":false}]');
    }
    if (command === "zellij" && args[1] === "new-pane") return ok("terminal_12\n");
    if (command === "zellij" && args[1] === "send-keys") return ok();
    return { code: 1, stdout: "", stderr: `unexpected command: ${key}` };
  };
}

async function withRunner(
  exec: CommandExecutor,
  run: (runner: ReturnType<typeof createWorkRunnerWithDependencies>, stateDir: string) => Promise<void>,
  persistRecord: (path: string, record: TaskRunRecord) => Promise<void> = async (path, record) => {
    await writeFile(path, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  }
): Promise<void> {
  const stateDir = await mkdtemp(join(tmpdir(), "task-picker-runner-"));
  try {
    const runner = createWorkRunnerWithDependencies({
      exec,
      env: { ZELLIJ: "1" },
      stateDir,
      now: () => new Date("2026-07-20T12:00:00.000Z"),
      createId: () => "abc123",
      canonicalize: async (path) => path,
      persistRecord,
      workerPolicyPath: "/extension/work-runner/worker-policy.ts",
      statusPanePath: "/extension/work-runner/status-pane.mjs",
    });
    await run(runner, stateDir);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
}

const request = {
  providerId: "gitlab",
  task: { ref: "gitlab.example/group/project#9", title: "unsafe $(title)", status: "open" as const },
  execution: { prompt: "/execute-gitlab-issue https://gitlab.example/group/project/-/issues/9" },
  cwd: "/source",
};

test("missing prerequisite uses fallback without allocating", async () => {
  const calls: Call[] = [];
  const exec: CommandExecutor = async (command, args, options) => {
    calls.push({ command, args, options });
    if (command === "treehouse") return { code: 127, stdout: "", stderr: "missing" };
    if (command === "no-mistakes") return ok("--intent");
    return ok();
  };
  await withRunner(exec, async (runner) => {
    assert.deepEqual(await runner.start(request), { kind: "fallback" });
  });
  assert.equal(calls.some((call) => call.command === "treehouse" && call.args.includes("--lease")), false);
  assert.equal(calls.some((call) => call.command === "zellij" && call.args.includes("new-tab")), false);
});

test("incomplete prerequisite capabilities use fallback before allocation", async () => {
  for (const [name, overrides] of [
    ["lease holder", { "treehouse get --help": ok("--lease") }],
    ["no-mistakes respond", { "no-mistakes axi respond --help": { code: 2, stdout: "", stderr: "unknown" } }],
    ["active zellij tab", { "zellij action list-tabs --json": ok('[{"tab_id":2,"active":false}]') }],
    ["structural active zellij tab", { "zellij action list-tabs --json": ok('[{"active":true}]') }],
    ["nonempty zellij tabs", { "zellij action list-tabs --json": ok("[]") }],
    ["initialized no-mistakes repository", { "no-mistakes axi": { code: 1, stdout: "", stderr: "repo not initialized" } }],
  ] as const) {
    const calls: Call[] = [];
    await withRunner(successfulExecutor(calls, overrides), async (runner) => {
      assert.deepEqual(await runner.start(request), { kind: "fallback" }, name);
    });
    assert.equal(
      calls.some((call) => call.command === "treehouse" && call.args.includes("--lease")),
      false,
      name
    );
  }
});

test("repository gate preflight runs from the resolved primary root", async () => {
  const calls: Call[] = [];
  await withRunner(successfulExecutor(calls), async (runner) => {
    const result = await runner.start(request);
    assert.equal(result.kind, "launched");
  });
  assert.ok(calls.some((call) =>
    call.command === "no-mistakes" &&
    call.args.join(" ") === "axi" &&
    call.options?.cwd === "/repo"
  ));
});

test("record persistence failure before acquisition safely falls back", async () => {
  const calls: Call[] = [];
  let writes = 0;
  await withRunner(
    successfulExecutor(calls),
    async (runner) => {
      assert.deepEqual(await runner.start(request), { kind: "fallback" });
    },
    async (path, record) => {
      writes += 1;
      if (writes === 2) throw new Error("state unavailable");
      await writeFile(path, `${JSON.stringify(record)}\n`, "utf8");
    }
  );
  assert.equal(calls.some((call) => call.command === "treehouse" && call.args.includes("--lease")), false);
});

test("successful launch uses exact lease and Zellij argv without task text", async () => {
  const calls: Call[] = [];
  await withRunner(successfulExecutor(calls), async (runner) => {
    const result = await runner.start(request);
    assert.equal(result.kind, "launched");
    if (result.kind !== "launched") return;
    assert.equal(result.record.branch, "task-picker/abc123");
    assert.equal(result.record.phase, "launched");
    assert.deepEqual(result.record.zellij, {
      tabId: 7,
      workerPaneId: "terminal_11",
      statusPaneId: "terminal_12",
    });
  });

  const lease = calls.find((call) => call.command === "treehouse" && call.args[1] === "--lease");
  assert.deepEqual(lease, {
    command: "treehouse",
    args: ["get", "--lease", "--lease-holder", "task-picker:gitlab:abc123"],
    options: { cwd: "/repo", timeout: 60_000 },
  });
  const tab = calls.find((call) => call.command === "zellij" && call.args[1] === "new-tab");
  assert.ok(tab);
  assert.deepEqual(tab!.args.slice(0, 12), [
    "action", "new-tab", "--cwd", "/pool/wt", "--name", "task-picker-abc123",
    "--start-suspended", "--", "env", tab!.args[9], "TASK_PICKER_ISOLATED_RUN=1", "pi",
  ]);
  assert.match(tab!.args[9]!, /TASK_PICKER_RUN_FILE=.*abc123\.json$/);
  assert.deepEqual(tab!.args.slice(12), [
    "--name", "task-picker-abc123", "--extension", "/extension/work-runner/worker-policy.ts",
    request.execution.prompt,
  ]);
  assert.equal(tab!.args.join(" ").includes(request.task.title), false);
  const statusPane = calls.find((call) => call.command === "zellij" && call.args[1] === "new-pane");
  assert.ok(statusPane);
  assert.deepEqual(statusPane!.args.slice(0, 13), [
    "action", "new-pane", "--tab-id", "7", "--direction", "right", "--cwd", "/pool/wt",
    "--name", "status", "--", "env", statusPane!.args[12],
  ]);
  assert.match(statusPane!.args[12]!, /TASK_PICKER_RUN_FILE=.*abc123\.json$/);
  assert.deepEqual(statusPane!.args.slice(13), [
    "node", "/extension/work-runner/status-pane.mjs",
  ]);
  const startWorker = calls.find((call) => call.command === "zellij" && call.args[1] === "send-keys");
  assert.deepEqual(startWorker?.args, [
    "action", "send-keys", "--pane-id", "terminal_11", "Enter",
  ]);
  assert.ok(calls.indexOf(startWorker!) > calls.indexOf(statusPane!));
});

test("lease attestation rejects a linked worktree from another repository", async () => {
  const calls: Call[] = [];
  const exec = successfulExecutor(calls, {
    "git -C /pool/wt rev-parse --git-common-dir": ok("/other/.git\n"),
  });
  await withRunner(exec, async (runner, stateDir) => {
    await assert.rejects(() => runner.start(request), /different Git repository/);
    const record = JSON.parse(await readFile(join(stateDir, "abc123.json"), "utf8"));
    assert.equal(record.phase, "failed");
    assert.match(record.error, /different Git repository/);
  });
});

test("post-new-tab failure retains partial Zellij endpoint metadata", async () => {
  const calls: Call[] = [];
  const statusKey = "zellij action new-pane --tab-id 7 --direction right --cwd /pool/wt --name status -- env TASK_PICKER_RUN_FILE=/unused node /extension/work-runner/status-pane.mjs";
  const base = successfulExecutor(calls);
  const exec: CommandExecutor = async (command, args, options) => {
    if (command === "zellij" && args[1] === "new-pane") {
      calls.push({ command, args, options });
      return { code: 1, stdout: "", stderr: `pane unavailable: ${statusKey}` };
    }
    return base(command, args, options);
  };
  await withRunner(exec, async (runner, stateDir) => {
    await assert.rejects(() => runner.start(request), /Recovery metadata:/);
    const record = JSON.parse(await readFile(join(stateDir, "abc123.json"), "utf8"));
    assert.equal(record.phase, "failed");
    assert.deepEqual(record.zellij, { tabId: 7, workerPaneId: "terminal_11" });
    assert.equal(record.zellijTabName, "task-picker-abc123");
  });
});

test("post-acquisition verification failure retains failed recovery metadata", async () => {
  const calls: Call[] = [];
  const exec = successfulExecutor(calls, {
    "git -C /pool/wt status --porcelain": ok(" M unsafe.txt\n"),
  });
  await withRunner(exec, async (runner, stateDir) => {
    await assert.rejects(() => runner.start(request), /Recovery metadata:/);
    const record = JSON.parse(await readFile(join(stateDir, "abc123.json"), "utf8"));
    assert.equal(record.phase, "failed");
    assert.equal(record.leaseAttempted, true);
    assert.equal(record.leasePath, "/pool/wt");
    assert.match(record.error, /not clean/);
  });
  assert.equal(calls.some((call) => call.command === "zellij" && call.args.includes("new-tab")), false);
});

test("worker policy confines record paths and binds filename IDs to record IDs", async () => {
  const configDir = await mkdtemp(join(tmpdir(), "task-picker-policy-"));
  try {
    const runsDir = join(configDir, "task-picker-runs");
    await mkdir(runsDir);
    const id = "abcdef123456";
    const path = join(runsDir, `${id}.json`);
    const record = { version: 1, id };
    await writeFile(path, JSON.stringify(record), "utf8");

    assert.deepEqual(validateRunRecordPath(path, { PI_CODING_AGENT_DIR: configDir }), {
      path,
      id,
      runsDir,
    });
    assert.equal(validateRunRecordPath("relative.json", { PI_CODING_AGENT_DIR: configDir }), null);
    assert.equal(validateRunRecordPath(join(configDir, `${id}.json`), { PI_CODING_AGENT_DIR: configDir }), null);
    assert.equal(validateRunRecordPath(join(runsDir, "bad.json"), { PI_CODING_AGENT_DIR: configDir }), null);
    await assert.rejects(() => readRunRecord(path, "000000000000"), /Invalid task-picker run record/);
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
});

test("worker policy defines ready-for-review without closing trackers", () => {
  assert.deepEqual(WORKER_PHASES, [
    "implementing", "validating", "awaiting-decision", "ready-for-review", "failed",
  ]);
  const instructions = isolatedWorkerInstructions();
  assert.match(instructions, /git ls-remote --exit-code origin HEAD/);
  assert.match(instructions, /SSH agent such as Secretive is locked/);
  assert.match(instructions, /run `no-mistakes rerun`/);
  assert.match(instructions, /injected only after no-mistakes capability is confirmed/);
  assert.match(instructions, /validated task-scoped diff without committing it/);
  assert.match(
    instructions,
    /No-mistakes owns the commit, push, MR creation or update, and every MR metadata or settings correction/
  );
  assert.match(instructions, /Route every correction through no-mistakes/);
  assert.doesNotMatch(instructions, /you own the task-scoped commit|After committing/);
  assert.match(instructions, /configured readyForReviewLabel/);
  assert.match(instructions, /For Beads, leave the item open/);
  assert.match(instructions, /Never return the Treehouse lease/);
  assert.doesNotMatch(instructions, /--yes to/);
});
