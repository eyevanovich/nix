import { afterEach, expect, mock, test } from "bun:test";
import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { readFile, rm, writeFile } from "node:fs/promises";

mock.module("@earendil-works/pi-coding-agent", () => ({
  DEFAULT_MAX_BYTES: 50_000,
  DEFAULT_MAX_LINES: 2_000,
  truncateTail: (content: string) => ({
    content,
    totalLines: content === "" ? 0 : content.split("\n").length,
    truncated: false,
  }),
}));

mock.module("typebox", () => ({
  Type: {
    Array: (items: unknown, options: unknown = {}) => ({ items, ...asObject(options) }),
    Boolean: (options: unknown = {}) => asObject(options),
    Integer: (options: unknown = {}) => asObject(options),
    Literal: (value: unknown) => ({ const: value }),
    Object: (properties: unknown, options: unknown = {}) => ({ properties, ...asObject(options) }),
    Optional: (value: unknown) => ({ optional: value }),
    String: (options: unknown = {}) => asObject(options),
    Union: (values: unknown) => ({ anyOf: values }),
  },
}));

function asObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}

type ExecResult = {
  code: number;
  stdout: string;
  stderr: string;
  killed?: boolean;
};

type RegisteredTool = {
  name: string;
  execute: (...args: any[]) => Promise<any>;
};

type FakePi = {
  tools: RegisteredTool[];
  calls: Array<{ command: string; args: string[]; options?: Record<string, unknown> }>;
  exec: (command: string, args: string[], options?: Record<string, unknown>) => Promise<ExecResult>;
  on: () => void;
  registerTool: (tool: RegisteredTool) => void;
};

const source = new URL("./index.ts", import.meta.url).href;
const savedEnvironment = {
  HERDR_ENV: process.env.HERDR_ENV,
  HERDR_BIN_PATH: process.env.HERDR_BIN_PATH,
  HERDR_WORKSPACE_ID: process.env.HERDR_WORKSPACE_ID,
  HERDR_TAB_ID: process.env.HERDR_TAB_ID,
  HERDR_PANE_ID: process.env.HERDR_PANE_ID,
};

afterEach(() => {
  for (const [name, value] of Object.entries(savedEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function enableHerdr(): void {
  process.env.HERDR_ENV = "1";
  process.env.HERDR_BIN_PATH = "/nix/store/herdr/bin/herdr";
  process.env.HERDR_WORKSPACE_ID = "w1";
  process.env.HERDR_TAB_ID = "w1:t1";
  process.env.HERDR_PANE_ID = "w1:p1";
}

function response(result: unknown): ExecResult {
  return { code: 0, stdout: JSON.stringify({ id: "fixture", result }), stderr: "" };
}

function success(type: string, values: Record<string, unknown> = {}): ExecResult {
  return response({ type, ...values });
}

function capabilitySchema(extraMethods: string[] = []): ExecResult {
  const methods = [...extraMethods, "workspace.list", "tab.create", "tab.close", "tab.list", "pane.list", "pane.current", "pane.read", "pane.wait_for_output", "pane.close", "pane.send_text", "pane.send_keys", "pane.rename", "agent.list", "agent.start", "agent.prompt", "agent.wait", "agent.read", "agent.focus", "agent.send_keys"];
  return { code: 0, stdout: JSON.stringify({ schemas: { request: { oneOf: methods.map((method) => ({ properties: { method: { const: method } } })) } } }), stderr: "" };
}

function createPi(handler: (command: string, args: string[]) => ExecResult | Promise<ExecResult>): FakePi {
  const tools: RegisteredTool[] = [];
  const calls: FakePi["calls"] = [];
  return {
    tools,
    calls,
    on() {},
    registerTool(tool) {
      tools.push(tool);
    },
    async exec(command, args, options) {
      calls.push({ command, args, options });
      if (args.join(" ") === "api schema --json") return capabilitySchema();
      if (args.join(" ") === "pane run --help") return { code: 0, stdout: "Usage: herdr pane run <PANE_ID> <COMMAND>...\n", stderr: "" };
      return handler(command, args);
    },
  };
}

async function loadExtension(pi: FakePi): Promise<void> {
  const extension = (await import(`${source}?test=${Date.now()}-${Math.random()}`)).default;
  extension(pi);
}

function tool(pi: FakePi, name: string): RegisteredTool {
  const registered = pi.tools.find((candidate) => candidate.name === name);
  if (!registered) throw new Error(`Expected ${name} to be registered`);
  return registered;
}

function tabCreated(): ExecResult {
  return success("tab_created", {
    tab: { tab_id: "w1:t9", workspace_id: "w1", label: "tests", number: 9, focused: false, pane_count: 1, agent_status: "idle" },
    root_pane: { pane_id: "w1:p9", terminal_id: "term_9", workspace_id: "w1", tab_id: "w1:t9", focused: false, agent_status: "idle", revision: 1 },
  });
}

const runnerDirectories = new Set<string>();
const runnerProcesses: ReturnType<typeof Bun.spawn>[] = [];

afterEach(async () => {
  await Promise.all(runnerProcesses.splice(0).map((process) => process.exited));
  await Promise.all([...runnerDirectories].map((directory) => rm(directory, { recursive: true, force: true })));
  runnerDirectories.clear();
});

function runnerPi(onRun?: (runnerPath: string) => Promise<ExecResult>, readFailure = false, closeResult = success("ok")): FakePi {
  return createPi(async (_command, args) => {
    if (args[0] === "tab" && args[1] === "create") return tabCreated();
    if (args[0] === "pane" && args[1] === "run") {
      const runnerPath = args[3].slice(1, -1);
      runnerDirectories.add(dirname(runnerPath));
      if (onRun) return onRun(runnerPath);
      runnerProcesses.push(Bun.spawn(["/bin/sh", runnerPath], { stdout: "ignore", stderr: "ignore" }));
      return { code: 0, stdout: "", stderr: "" };
    }
    if (args[0] === "pane" && args[1] === "read") {
      if (readFailure) return { code: 1, stdout: "", stderr: "output unavailable" };
      return { code: 0, stdout: "command output", stderr: "" };
    }
    if (args[0] === "tab" && args[1] === "close") return closeResult;
    throw new Error(`Unexpected Herdr argv: ${args.join(" ")}`);
  });
}

async function runAndWait(pi: FakePi, command: string, timeout_ms = 1_000, signal?: AbortSignal): Promise<any> {
  return tool(pi, "herdr_run_and_wait").execute("run", { command, timeout_ms }, signal, undefined, { cwd: process.cwd() });
}

test.each(["TERM", "KILL"])("reports unknown completion when the real wrapper receives SIG%s", async (signal) => {
  enableHerdr();
  const pi = runnerPi();
  await loadExtension(pi);
  const result = await runAndWait(pi, `kill -${signal} "$PPID"`, 500);
  expect(result.details).toMatchObject({ status: "completion_unknown", workMayBeRunning: true });
  expect(result.details.exitCode).toBeUndefined();
  expect(pi.calls.some((call) => call.args[0] === "tab" && call.args[1] === "close")).toBe(false);
  expect(existsSync([...runnerDirectories][0])).toBe(true);
});

test.each([0, 7, 255])("records real command exit %i and closes only completed work", async (exitCode) => {
  enableHerdr();
  const pi = runnerPi();
  await loadExtension(pi);
  const result = await runAndWait(pi, `exit ${exitCode}`);
  expect(result.details).toMatchObject({ status: "completed", exitCode });
  expect(pi.calls.filter((call) => call.args[0] === "pane" && call.args[1] === "read")).toHaveLength(1);
  expect(pi.calls.filter((call) => call.args[0] === "tab" && call.args[1] === "close")).toHaveLength(1);
  expect(existsSync([...runnerDirectories][0])).toBe(false);
});

test("keeps concurrent command records isolated", async () => {
  enableHerdr();
  const pi = runnerPi();
  await loadExtension(pi);
  const results = await Promise.all([runAndWait(pi, "exit 0"), runAndWait(pi, "exit 7")]);
  expect(results.map((result) => result.details.exitCode)).toEqual([0, 7]);
  expect(new Set(results.map((result) => result.details.commandId)).size).toBe(2);
});

async function startRunner(runnerPath: string): Promise<ExecResult> {
  runnerProcesses.push(Bun.spawn(["/bin/sh", runnerPath], { stdout: "ignore", stderr: "ignore" }));
  const deadline = performance.now() + 1_000;
  while (performance.now() < deadline) {
    if (existsSync(join(dirname(runnerPath), "status"))) return { code: 0, stdout: "", stderr: "" };
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Runner did not publish its start record");
}

test("preserves a running command and its records on timeout", async () => {
  enableHerdr();
  const pi = runnerPi(startRunner);
  await loadExtension(pi);
  const result = await runAndWait(pi, "sleep 0.2", 40);
  expect(result.details).toMatchObject({ status: "timeout", executionState: "running", workMayBeRunning: true });
  expect(pi.calls.some((call) => call.args[1] === "close")).toBe(false);
  expect(existsSync([...runnerDirectories][0])).toBe(true);
});

test("cancellation while monitoring does not terminate the command", async () => {
  enableHerdr();
  const controller = new AbortController();
  const pi = runnerPi(async (path) => {
    const result = await startRunner(path);
    setTimeout(() => controller.abort(), 10);
    return result;
  });
  await loadExtension(pi);
  const result = await runAndWait(pi, "sleep 0.1; exit 7", 1_000, controller.signal);
  expect(result.details).toMatchObject({ status: "cancelled", executionState: "running", workMayBeRunning: true });
  expect(pi.calls.some((call) => call.args[1] === "close")).toBe(false);
  expect(await runnerProcesses.at(-1)?.exited).toBe(7);
  expect(JSON.parse(await readFile(join([...runnerDirectories][0], "status"), "utf8"))).toMatchObject({ phase: "completed", exitCode: 7 });
});

test("reports wrapper death without closing work while a child survives", async () => {
  enableHerdr();
  const pi = runnerPi();
  await loadExtension(pi);
  const result = await runAndWait(pi, 'kill -KILL "$PPID"; sleep 0.2', 500);
  expect(result.details).toMatchObject({ status: "completion_unknown", workMayBeRunning: true });
  expect(pi.calls.some((call) => call.args[1] === "close")).toBe(false);
});

test("does not claim an acknowledged but unstarted command ran", async () => {
  enableHerdr();
  const pi = runnerPi(async () => ({ code: 0, stdout: "", stderr: "" }));
  await loadExtension(pi);
  const result = await runAndWait(pi, "exit 0", 20);
  expect(result.details).toMatchObject({ status: "timeout", executionState: "start_unconfirmed", workMayBeRunning: true });
  expect(pi.calls.some((call) => call.args[1] === "close")).toBe(false);
});

test("preserves work when command dispatch is cancelled ambiguously", async () => {
  enableHerdr();
  const controller = new AbortController();
  const pi = runnerPi(async () => {
    controller.abort();
    return { code: 0, stdout: "", stderr: "", killed: true };
  });
  await loadExtension(pi);
  const result = await runAndWait(pi, "exit 0", 1_000, controller.signal);
  expect(result.details).toMatchObject({ status: "cancelled", workMayBeRunning: true, paneId: "w1:p9" });
  expect(pi.calls.some((call) => call.args[1] === "close")).toBe(false);
  expect(existsSync([...runnerDirectories][0])).toBe(true);
});

test.each(["invalid JSON", "stale", "invalid exit code", "invalid PID"])("preserves work with %s completion record", async (variant) => {
  enableHerdr();
  const pi = runnerPi(async (runnerPath) => {
    const directory = dirname(runnerPath);
    const record = { commandId: variant === "stale" ? "another-command" : basename(directory), phase: variant === "invalid PID" ? "running" : "completed", pid: 0, exitCode: variant === "invalid exit code" ? 256 : 0 };
    await writeFile(join(directory, "status"), variant === "invalid JSON" ? "broken" : JSON.stringify(record));
    return { code: 0, stdout: "", stderr: "" };
  });
  await loadExtension(pi);
  const result = await runAndWait(pi, "exit 0", 100);
  expect(result.details).toMatchObject({ status: "completion_unknown", workMayBeRunning: true });
  expect(result.details.exitCode).toBeUndefined();
  expect(pi.calls.some((call) => call.args[1] === "close")).toBe(false);
});

test("keeps a known exit code when output retrieval fails", async () => {
  enableHerdr();
  const pi = runnerPi(undefined, true);
  await loadExtension(pi);
  const result = await runAndWait(pi, "exit 7");
  expect(result.details).toMatchObject({ status: "completed", exitCode: 7 });
  expect(result.details.outputWarning).toContain("output unavailable");
  expect(pi.calls.some((call) => call.args[1] === "close")).toBe(false);
  expect(existsSync([...runnerDirectories][0])).toBe(true);
});

test.each(["herdr_run", "herdr_run_and_wait"])("preserves ambiguous dispatch failures for %s", async (name) => {
  enableHerdr();
  const pi = runnerPi(async () => ({ code: 1, stdout: "", stderr: "transport failed after submission" }));
  await loadExtension(pi);
  const result = await tool(pi, name).execute("run", { command: "exit 0", close_on_exit: true }, undefined, undefined, { cwd: process.cwd() });
  expect(result.details).toMatchObject({ status: "submission_unknown", workMayBeRunning: true });
  expect(existsSync([...runnerDirectories][0])).toBe(true);
  expect(pi.calls.some((call) => call.args[1] === "close")).toBe(false);
});

test.each([success("unexpected"), { code: 1, stdout: "", stderr: "close failed" }])("preserves known completion on cleanup failure %p", async (closeResult) => {
  enableHerdr();
  const pi = runnerPi(undefined, false, closeResult);
  await loadExtension(pi);
  const result = await runAndWait(pi, "exit 7");
  expect(result.details).toMatchObject({ status: "completed", exitCode: 7 });
  expect(result.details.cleanupWarning).toBeString();
  expect(existsSync([...runnerDirectories][0])).toBe(true);
  expect(pi.calls.filter((call) => call.args[1] === "close")).toHaveLength(1);
});

test.each(["ok", "pane_closed"])("accepts %s acknowledgement after closing an owned pane", async (type) => {
  enableHerdr();
  const pi = createPi((_command, args) => {
    if (args.join(" ") === "pane current --current") return success("pane_current", { pane: { pane_id: "w1:p1", workspace_id: "w1", tab_id: "w1:t1" } });
    if (args.join(" ") === "pane close w1:p2") return success(type);
    throw new Error(`Unexpected Herdr argv: ${args.join(" ")}`);
  });
  await loadExtension(pi);
  const result = await tool(pi, "herdr_close").execute("close", { pane_id: "w1:p2" });
  expect(result.details).toEqual({ paneId: "w1:p2" });
  expect(pi.calls.filter((call) => call.args[1] === "close")).toHaveLength(1);
});

test("registers no Herdr tools outside Herdr", async () => {
  delete process.env.HERDR_ENV;
  const pi = createPi(() => success("ok"));

  await loadExtension(pi);

  expect(pi.tools).toHaveLength(0);
  expect(pi.calls).toHaveLength(0);
});

test("checks capabilities without consulting a version and caches successful probes", async () => {
  enableHerdr();
  const pi = createPi((_command, args) => {
    if (args.join(" ") === "--version") throw new Error("Compatibility must not depend on a version");
    if (args.join(" ") === "pane run w1:p2 printf done") return { code: 0, stdout: "", stderr: "" };
    throw new Error(`Unexpected Herdr argv: ${args.join(" ")}`);
  });

  await loadExtension(pi);
  const run = tool(pi, "herdr_pane_run");
  await run.execute("first", { pane_id: "w1:p2", command: "printf done" });
  await run.execute("second", { pane_id: "w1:p2", command: "printf done" });

  const commands = pi.calls.map((call) => call.args.join(" "));
  expect(commands).not.toContain("--version");
  expect(commands.filter((command) => command === "pane run --help")).toHaveLength(1);
  expect(commands.filter((command) => command === "api schema --json")).toHaveLength(1);
  expect(commands.filter((command) => command === "pane run w1:p2 printf done")).toHaveLength(2);
});

test.each([
  ["missing CLI", "pane run --help", { code: 2, stdout: "", stderr: "unknown command: run" }, "unknown command: run"],
  ["missing method", "api schema --json", { code: 0, stdout: JSON.stringify({ schemas: { request: { oneOf: [] } } }), stderr: "" }, "missing required CLI capabilities: workspace.list"],
  ["malformed schema", "api schema --json", { code: 0, stdout: "not JSON", stderr: "" }, "malformed JSON"],
  ["failed schema", "api schema --json", { code: 1, stdout: "", stderr: "schema unavailable" }, "schema unavailable"],
] as const)("blocks mutations and retries discovery after %s", async (_name, probe, failure, message) => {
  enableHerdr();
  const pi = createPi((_command, args) => {
    if (args.join(" ") === "pane run w1:p2 printf done") return { code: 0, stdout: "", stderr: "" };
    throw new Error(`Unexpected Herdr argv: ${args.join(" ")}`);
  });
  const originalExec = pi.exec;
  const attempted: string[] = [];
  let fail = true;
  pi.exec = async (command, args, options) => {
    const operation = args.join(" ");
    attempted.push(operation);
    if (fail && operation === probe) return failure;
    return originalExec(command, args, options);
  };

  await loadExtension(pi);
  const run = tool(pi, "herdr_pane_run");
  await expect(run.execute("first", { pane_id: "w1:p2", command: "printf done" })).rejects.toThrow("HERDR_UNSUPPORTED:");
  expect(attempted).toEqual(probe === "pane run --help" ? [probe] : ["pane run --help", probe]);
  await expect(run.execute("second", { pane_id: "w1:p2", command: "printf done" })).rejects.toThrow(message);
  expect(attempted).not.toContain("pane run w1:p2 printf done");

  fail = false;
  await run.execute("retry", { pane_id: "w1:p2", command: "printf done" });
  expect(attempted.filter((command) => command === "pane run --help")).toHaveLength(3);
  expect(attempted.at(-1)).toBe("pane run w1:p2 printf done");
});

test("fails compatibility before topology mutation when Herdr lacks a required schema capability", async () => {
  enableHerdr();
  const pi = createPi((_command, args) => {
    throw new Error(`Topology mutation must not run: ${args.join(" ")}`);
  });
  const originalExec = pi.exec;
  pi.exec = async (command, args, options) => {
    if (args.join(" ") === "api schema --json") {
      return { code: 0, stdout: JSON.stringify({ schemas: { request: { oneOf: [] } } }), stderr: "" };
    }
    return originalExec(command, args, options);
  };

  await loadExtension(pi);

  await expect(tool(pi, "herdr_run").execute("test", { command: "npm test" }, undefined, undefined, { cwd: "/project" })).rejects.toThrow("HERDR_UNSUPPORTED");
  expect(pi.calls.map((call) => call.args.join(" "))).not.toContain("tab create --workspace w1 --cwd /project --no-focus");
});

test.each([false, true])("uses a single snapshot with all_workspaces=%s", async (allWorkspaces) => {
  enableHerdr();
  const snapshot = {
    workspaces: [{ workspace_id: "w1" }, { workspace_id: "w2" }],
    tabs: [{ tab_id: "w1:t1", workspace_id: "w1" }, { tab_id: "w2:t1", workspace_id: "w2" }],
    panes: [{ pane_id: "w1:p1", tab_id: "w1:t1", workspace_id: "w1" }, { pane_id: "w2:p1", tab_id: "w2:t1", workspace_id: "w2" }],
    agents: [{ name: "local", workspace_id: "w1" }, { name: "other", workspace_id: "w2" }],
  };
  const pi = createPi((_command, args) => {
    if (args.join(" ") === "api snapshot") return success("session_snapshot", { snapshot });
    throw new Error(`Unexpected Herdr argv: ${args.join(" ")}`);
  });
  const exec = pi.exec;
  pi.exec = async (command, args, options) => args.join(" ") === "api schema --json" ? capabilitySchema(["session.snapshot"]) : exec(command, args, options);
  await loadExtension(pi);
  const result = await tool(pi, "herdr_list").execute("list", { all_workspaces: allWorkspaces });
  for (const field of ["workspaces", "tabs", "panes", "agents"] as const) {
    expect(result.details[field]).toEqual(allWorkspaces ? snapshot[field] : [snapshot[field][0]]);
  }
  expect(pi.calls.filter((call) => call.args.join(" ") === "api snapshot")).toHaveLength(1);
  expect(pi.calls.some((call) => call.args[1] === "list")).toBe(false);
});

test.each(["missing collection", "wrong workspace", "failed snapshot"])("does not hide %s with legacy discovery", async (variant) => {
  enableHerdr();
  const pi = createPi((_command, args) => {
    if (args.join(" ") === "api snapshot") {
      if (variant === "failed snapshot") return { code: 1, stdout: "", stderr: "snapshot unavailable" };
      return success("session_snapshot", { snapshot: { workspaces: [{ workspace_id: "w2" }], tabs: [], panes: [], ...(variant === "missing collection" ? {} : { agents: [] }) } });
    }
    throw new Error(`Unexpected Herdr argv: ${args.join(" ")}`);
  });
  const exec = pi.exec;
  pi.exec = async (command, args, options) => args.join(" ") === "api schema --json" ? capabilitySchema(["session.snapshot"]) : exec(command, args, options);
  await loadExtension(pi);
  await expect(tool(pi, "herdr_list").execute("list", {})).rejects.toThrow(variant === "failed snapshot" ? "HERDR_SERVER_ERROR" : "HERDR_PROTOCOL_ERROR");
  expect(pi.calls.some((call) => call.args[1] === "list")).toBe(false);
});

test.each(["{incomplete JSON", "[plain log line]", '{"message":"server ready"}'])("keeps JSON-looking output verbatim: %s", async (stdout) => {
  enableHerdr();
  const pi = createPi((_command, args) => {
    if (args[0] === "pane" && args[1] === "read") return { code: 0, stdout, stderr: "" };
    throw new Error(`Unexpected Herdr argv: ${args.join(" ")}`);
  });
  await loadExtension(pi);
  const result = await tool(pi, "herdr_pane_output").execute("read", { pane_id: "w1:p2" });
  expect(result.content[0].text).toContain(stdout);
  expect(pi.calls.filter((call) => call.args[1] === "read")).toHaveLength(1);
});

test("reads agent text once and validates structured envelopes", async () => {
  enableHerdr();
  let stdout = "agent response";
  const pi = createPi((_command, args) => {
    if (args[0] === "agent" && args[1] === "read") return { code: 0, stdout, stderr: "" };
    throw new Error(`Unexpected Herdr argv: ${args.join(" ")}`);
  });
  await loadExtension(pi);
  const read = tool(pi, "herdr_agent_read");
  expect((await read.execute("read", { target: "reviewer" })).content[0].text).toContain(stdout);
  expect(pi.calls.filter((call) => call.args[1] === "read")).toHaveLength(1);
  stdout = JSON.stringify({ id: "fixture", result: { type: "wrong" } });
  await expect(read.execute("bad", { target: "reviewer" })).rejects.toThrow("HERDR_PROTOCOL_ERROR");
  expect(pi.calls.filter((call) => call.args[1] === "read")).toHaveLength(2);
});

test("herdr_list combines the caller workspace topology and detected agents", async () => {
  enableHerdr();
  const pi = createPi((_command, args) => {
    const command = args.join(" ");
    if (command === "workspace list") return success("workspace_list", { workspaces: [{ workspace_id: "w1", label: "project", number: 1, focused: true, pane_count: 1, tab_count: 1, active_tab_id: "w1:t1", agent_status: "working" }] });
    if (command === "tab list --workspace w1") return success("tab_list", { tabs: [{ tab_id: "w1:t1", workspace_id: "w1", label: "main", number: 1, focused: true, pane_count: 1, agent_status: "working" }] });
    if (command === "pane list --workspace w1") return success("pane_list", { panes: [{ pane_id: "w1:p1", terminal_id: "term_1", workspace_id: "w1", tab_id: "w1:t1", focused: true, agent_status: "working", revision: 1, terminal_title: "Pi" }] });
    if (command === "agent list") return success("agent_list", { agents: [{ name: "reviewer", pane_id: "w1:p1", terminal_id: "term_1", workspace_id: "w1", tab_id: "w1:t1", focused: true, agent_status: "working", revision: 1 }] });
    throw new Error(`Unexpected Herdr argv: ${command}`);
  });

  await loadExtension(pi);
  const result = await tool(pi, "herdr_list").execute("test", {});

  expect(result.content[0].text).toContain("Panes (1):\n- w1:p1; workspace w1; tab w1:t1; terminal term_1; title Pi; focused true; status working");
  expect(result.content[0].text).toContain("Recognized agents (1):\n- reviewer; pane w1:p1; workspace w1; tab w1:t1; status working");
  expect(result.details).toEqual({
    allWorkspaces: false,
    workspaces: [{ workspace_id: "w1", label: "project", number: 1, focused: true, pane_count: 1, tab_count: 1, active_tab_id: "w1:t1", agent_status: "working" }],
    tabs: [{ tab_id: "w1:t1", workspace_id: "w1", label: "main", number: 1, focused: true, pane_count: 1, agent_status: "working" }],
    panes: [{ pane_id: "w1:p1", terminal_id: "term_1", workspace_id: "w1", tab_id: "w1:t1", focused: true, agent_status: "working", revision: 1, terminal_title: "Pi" }],
    agents: [{ name: "reviewer", pane_id: "w1:p1", terminal_id: "term_1", workspace_id: "w1", tab_id: "w1:t1", focused: true, agent_status: "working", revision: 1 }],
  });
  expect(pi.calls.map((call) => call.args.join(" "))).toContain("pane list --workspace w1");
});

test("herdr_list keeps long identifiers exact and bounds each inventory section", async () => {
  enableHerdr();
  const paneIds = Array.from({ length: 21 }, (_, index) => `w1:p${String(index).padStart(2, "0")}`);
  const longPaneId = `${paneIds[0]}-${"x".repeat(64)}`;
  paneIds[0] = longPaneId;
  const pi = createPi((_command, args) => {
    const command = args.join(" ");
    if (command === "workspace list") return success("workspace_list", { workspaces: [{ workspace_id: "w1" }] });
    if (command === "tab list --workspace w1") return success("tab_list", { tabs: [{ tab_id: "w1:t1", workspace_id: "w1" }] });
    if (command === "pane list --workspace w1") return success("pane_list", {
      panes: paneIds.reverse().map((pane_id) => ({ pane_id, workspace_id: "w1", tab_id: "w1:t1" })),
    });
    if (command === "agent list") return success("agent_list", { agents: [] });
    throw new Error(`Unexpected Herdr argv: ${command}`);
  });

  await loadExtension(pi);
  const result = await tool(pi, "herdr_list").execute("test", {});
  const output = result.content[0].text;

  expect(output).toContain(longPaneId);
  expect(output).toContain("- … 1 additional panes omitted");
  expect(output.indexOf("w1:p01")).toBeLessThan(output.indexOf("w1:p02"));
  expect(output).not.toContain("w1:p20; workspace");
});

test("herdr_run creates an unfocused current-workspace tab then atomically starts its command", async () => {
  enableHerdr();
  const pi = createPi((_command, args) => {
    if (args.join(" ") === "tab create --workspace w1 --cwd /project --label tests --no-focus") return tabCreated();
    if (args[0] === "pane" && args[1] === "run") return { code: 0, stdout: "", stderr: "" };
    throw new Error(`Unexpected Herdr argv: ${args.join(" ")}`);
  });

  await loadExtension(pi);
  const result = await tool(pi, "herdr_run").execute("test", { command: "npm test", label: "tests", cwd: "/project" });

  expect(result.details).toMatchObject({ workspaceId: "w1", tabId: "w1:t9", paneId: "w1:p9", command: "npm test" });
  expect(pi.calls.map((call) => call.args)).toContainEqual(["tab", "create", "--workspace", "w1", "--cwd", "/project", "--label", "tests", "--no-focus"]);
  expect(pi.calls.map((call) => call.args)).toContainEqual(["pane", "run", "w1:p9", "npm test"]);
});

test("herdr_run with close_on_exit submits only an extension-owned runner", async () => {
  enableHerdr();
  const pi = createPi((_command, args) => {
    if (args.join(" ") === "tab create --workspace w1 --cwd /project --label short-lived --no-focus") return tabCreated();
    if (args[0] === "pane" && args[1] === "run") return { code: 0, stdout: "", stderr: "" };
    throw new Error(`Unexpected Herdr argv: ${args.join(" ")}`);
  });

  await loadExtension(pi);
  const result = await tool(pi, "herdr_run").execute("test", { command: "printf '%s' done", label: "short-lived", cwd: "/project", close_on_exit: true }, undefined, undefined, { cwd: "/project" });

  const paneRun = pi.calls.find((call) => call.args[0] === "pane" && call.args[1] === "run" && call.args[2] === "w1:p9");
  expect(paneRun?.args[3]).toMatch(/^'.*\/pi-herdr-/);
  expect(paneRun?.args.join(" ")).not.toContain("printf");
  expect(result.details).toMatchObject({ closeOnExit: true, paneId: "w1:p9" });

  const runnerPath = String(paneRun?.args[3]).slice(1, -1);
  const runner = Bun.spawn(["/bin/sh", runnerPath], { stdout: "ignore", stderr: "ignore" });
  expect(await runner.exited).toBe(125);
  expect(existsSync(dirname(runnerPath))).toBe(false);
});

test("herdr_close refuses the canonical caller pane after it has moved", async () => {
  enableHerdr();
  const pi = createPi((_command, args) => {
    if (args.join(" ") === "pane current --current") return success("pane_current", { pane: { pane_id: "w2:p7", terminal_id: "term_caller", workspace_id: "w2", tab_id: "w2:t1", focused: true, agent_status: "working", revision: 4 } });
    throw new Error(`Unexpected Herdr argv: ${args.join(" ")}`);
  });

  await loadExtension(pi);

  await expect(tool(pi, "herdr_close").execute("test", { pane_id: "w2:p7" })).rejects.toThrow("Refusing to close the Pi caller pane");
  expect(pi.calls.map((call) => call.args.join(" "))).not.toContain("pane close w2:p7");
});

test("herdr_pane_run accepts Herdr's successful empty acknowledgement", async () => {
  enableHerdr();
  const pi = createPi((_command, args) => {
    if (args.join(" ") === "pane run w1:p2 printf done") return { code: 0, stdout: "", stderr: "" };
    throw new Error(`Unexpected Herdr argv: ${args.join(" ")}`);
  });

  await loadExtension(pi);
  const result = await tool(pi, "herdr_pane_run").execute("test", { pane_id: "w1:p2", command: "printf done" });

  expect(result.details).toEqual({ paneId: "w1:p2", command: "printf done" });
  expect(pi.calls.map((call) => call.args.join(" "))).toContain("api schema --json");
  expect(pi.calls.map((call) => call.args.join(" "))).toContain("pane run w1:p2 printf done");
});

test("herdr_pane_run rejects malformed non-empty success output", async () => {
  enableHerdr();
  const pi = createPi((_command, args) => {
    if (args.join(" ") === "pane run w1:p2 printf done") return { code: 0, stdout: "unexpected output", stderr: "" };
    throw new Error(`Unexpected Herdr argv: ${args.join(" ")}`);
  });

  await loadExtension(pi);

  await expect(tool(pi, "herdr_pane_run").execute("test", { pane_id: "w1:p2", command: "printf done" })).rejects.toThrow("HERDR_PROTOCOL_ERROR");
});

test("herdr_send_keys accepts Herdr's successful empty acknowledgements", async () => {
  enableHerdr();
  const pi = createPi((_command, args) => {
    if (args.join(" ") === "pane send-text w1:p2 echo ready") return { code: 0, stdout: "", stderr: "" };
    if (args.join(" ") === "pane send-keys w1:p2 enter") return { code: 0, stdout: "", stderr: "" };
    throw new Error(`Unexpected Herdr argv: ${args.join(" ")}`);
  });

  await loadExtension(pi);
  const result = await tool(pi, "herdr_send_keys").execute("test", { pane_id: "w1:p2", text: "echo ready", keys: ["enter"] });

  expect(result.details).toEqual({ paneId: "w1:p2", text: "echo ready", keys: ["enter"] });
  expect(pi.calls.map((call) => call.args.join(" "))).toContain("api schema --json");
  expect(pi.calls.map((call) => call.args.join(" "))).toContain("pane send-text w1:p2 echo ready");
  expect(pi.calls.map((call) => call.args.join(" "))).toContain("pane send-keys w1:p2 enter");
});

test("herdr_agent_send_keys accepts Herdr's successful empty acknowledgement", async () => {
  enableHerdr();
  const pi = createPi((_command, args) => {
    if (args.join(" ") === "agent send-keys reviewer esc") return { code: 0, stdout: "", stderr: "" };
    throw new Error(`Unexpected Herdr argv: ${args.join(" ")}`);
  });

  await loadExtension(pi);
  const result = await tool(pi, "herdr_agent_send_keys").execute("test", { target: "reviewer", keys: ["esc"] });

  expect(result.details).toEqual({ target: "reviewer", keys: ["esc"] });
  expect(pi.calls.map((call) => call.args.join(" "))).toContain("api schema --json");
  expect(pi.calls.map((call) => call.args.join(" "))).toContain("agent send-keys reviewer esc");
});

test("herdr_pane_output returns Pi-truncated recent output and Herdr identifiers", async () => {
  enableHerdr();
  const pi = createPi((_command, args) => {
    if (args.join(" ") === "pane read w1:p2 --source recent-unwrapped --lines 40") {
      return { code: 0, stdout: "server ready", stderr: "" };
    }
    throw new Error(`Unexpected Herdr argv: ${args.join(" ")}`);
  });

  await loadExtension(pi);
  const result = await tool(pi, "herdr_pane_output").execute("test", { pane_id: "w1:p2", lines: 40 });

  expect(result.content[0].text).toContain("server ready");
  expect(result.details).toMatchObject({ paneId: "w1:p2", source: "recent-unwrapped", truncated: false });
  expect(pi.calls.filter((call) => call.args[0] === "pane" && call.args[1] === "read")).toHaveLength(1);
});

test("herdr_wait_for_output distinguishes an output match from transport failure", async () => {
  enableHerdr();
  const pi = createPi((_command, args) => {
    if (args.join(" ") === "pane wait-output w1:p2 --match ready --source recent-unwrapped --timeout 500") {
      return success("output_matched", { pane_id: "w1:p2", revision: 9, matched_line: "ready", read: { pane_id: "w1:p2", workspace_id: "w1", tab_id: "w1:t2", source: "recent_unwrapped", format: "text", text: "ready", revision: 9, truncated: false } });
    }
    throw new Error(`Unexpected Herdr argv: ${args.join(" ")}`);
  });

  await loadExtension(pi);
  const result = await tool(pi, "herdr_wait_for_output").execute("test", { pane_id: "w1:p2", match: "ready", timeout_ms: 500 });

  expect(result.details).toMatchObject({ paneId: "w1:p2", matched: true, matchedText: "ready", status: "matched" });
});

test("herdr_run_and_wait creates the tab in its requested cwd", async () => {
  enableHerdr();
  const controller = new AbortController();
  const pi = createPi((_command, args) => {
    if (args.join(" ") === "tab create --workspace w1 --cwd /other-project --label tests --no-focus") return tabCreated();
    if (args[0] === "pane" && args[1] === "run") {
      setTimeout(() => controller.abort(), 0);
      return { code: 0, stdout: "", stderr: "" };
    }
    throw new Error(`Unexpected Herdr argv: ${args.join(" ")}`);
  });

  await loadExtension(pi);
  const result = await tool(pi, "herdr_run_and_wait").execute("test", { command: "npm test", label: "tests", cwd: "/other-project" }, controller.signal, undefined, { cwd: "/project" });

  expect(result.details).toMatchObject({ status: "cancelled", paneId: "w1:p9" });
  expect(pi.calls.map((call) => call.args)).toContainEqual(["tab", "create", "--workspace", "w1", "--cwd", "/other-project", "--label", "tests", "--no-focus"]);
});

test("herdr_agent_start returns canonical topology from Herdr", async () => {
  enableHerdr();
  const pi = createPi((_command, args) => {
    if (args.join(" ") === "tab create --workspace w1 --cwd /project --label review --no-focus") return tabCreated();
    if (args.join(" ") === "agent start reviewer --kind codex --pane w1:p9 --timeout 30000 -- --model gpt-5") {
      return success("agent_started", { agent: { name: "reviewer", pane_id: "w1:p10", terminal_id: "term_10", workspace_id: "w1", tab_id: "w1:t10", focused: false, agent_status: "idle", revision: 2 }, argv: ["codex", "--model", "gpt-5"] });
    }
    throw new Error(`Unexpected Herdr argv: ${args.join(" ")}`);
  });

  await loadExtension(pi);
  const result = await tool(pi, "herdr_agent_start").execute("test", { name: "reviewer", kind: "codex", cwd: "/project", label: "review", args: ["--model", "gpt-5"] });

  expect(result.details).toMatchObject({ workspaceId: "w1", tabId: "w1:t10", paneId: "w1:p10", agent: { name: "reviewer", agent_status: "idle" } });
  expect(pi.calls.map((call) => call.args)).toContainEqual(["agent", "start", "reviewer", "--kind", "codex", "--pane", "w1:p9", "--timeout", "30000", "--", "--model", "gpt-5"]);
});

test("herdr_agent_prompt forwards one lifecycle-aware Herdr request", async () => {
  enableHerdr();
  const pi = createPi((_command, args) => {
    if (args.join(" ") === "agent prompt reviewer inspect --wait --until done --timeout 120000") {
      return success("agent_prompted", { agent: { name: "reviewer", pane_id: "w1:p9", terminal_id: "term_9", workspace_id: "w1", tab_id: "w1:t9", focused: false, agent_status: "done", revision: 4 } });
    }
    throw new Error(`Unexpected Herdr argv: ${args.join(" ")}`);
  });

  await loadExtension(pi);
  const result = await tool(pi, "herdr_agent_prompt").execute("test", { target: "reviewer", prompt: "inspect", wait: true, until: ["done"], timeout_ms: 120_000 });

  expect(result.details).toMatchObject({ target: "reviewer", status: "done", waited: true });
});

test("herdr_agent_wait preserves cancellation as a normal lifecycle outcome", async () => {
  enableHerdr();
  const pi = createPi((_command, args) => {
    if (args.join(" ") === "agent wait reviewer --until idle --timeout 10") return { code: 0, stdout: "", stderr: "", killed: true };
    throw new Error(`Unexpected Herdr argv: ${args.join(" ")}`);
  });

  await loadExtension(pi);
  const result = await tool(pi, "herdr_agent_wait").execute("test", { target: "reviewer", until: ["idle"], timeout_ms: 10 });

  expect(result.details).toEqual({ target: "reviewer", status: "cancelled" });
});

test("herdr_agent_start preserves cancellation instead of misreporting partial success", async () => {
  enableHerdr();
  const pi = createPi((_command, args) => {
    if (args.join(" ") === "agent start reviewer --kind codex --pane w1:p1 --timeout 30000") return { code: 0, stdout: "", stderr: "", killed: true };
    throw new Error(`Unexpected Herdr argv: ${args.join(" ")}`);
  });

  await loadExtension(pi);

  await expect(tool(pi, "herdr_agent_start").execute("test", { name: "reviewer", kind: "codex", pane_id: "w1:p1" })).rejects.toThrow("HERDR_CANCELLED");
});

test("herdr_agent_start returns created topology when cancellation follows tab creation", async () => {
  enableHerdr();
  const pi = createPi((_command, args) => {
    if (args.join(" ") === "tab create --workspace w1 --cwd /project --label worker --no-focus") return tabCreated();
    if (args.join(" ") === "agent start worker --kind codex --pane w1:p9 --timeout 30000") return { code: 0, stdout: "", stderr: "", killed: true };
    throw new Error(`Unexpected Herdr argv: ${args.join(" ")}`);
  });

  await loadExtension(pi);
  const result = await tool(pi, "herdr_agent_start").execute("test", { name: "worker", kind: "codex", cwd: "/project", label: "worker" });

  expect(result.details).toMatchObject({ tabId: "w1:t9", paneId: "w1:p9", status: "cancelled", workMayBeRunning: true });
});

test("surfaces a Herdr server error without treating it as malformed output", async () => {
  enableHerdr();
  const pi = createPi((_command, args) => {
    if (args.join(" ") === "agent wait reviewer --until idle --timeout 10") {
      return { code: 1, stdout: "", stderr: JSON.stringify({ error: { code: "agent_not_found", message: "No live agent reviewer" } }) };
    }
    throw new Error(`Unexpected Herdr argv: ${args.join(" ")}`);
  });

  await loadExtension(pi);

  await expect(tool(pi, "herdr_agent_wait").execute("test", { target: "reviewer", until: ["idle"], timeout_ms: 10 })).rejects.toThrow("HERDR_SERVER_ERROR: No live agent reviewer");
});
