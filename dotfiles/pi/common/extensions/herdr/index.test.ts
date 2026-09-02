import { afterEach, expect, mock, test } from "bun:test";
import { existsSync } from "node:fs";
import { dirname } from "node:path";

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

function capabilitySchema(): ExecResult {
  const methods = ["workspace.list", "tab.create", "tab.close", "tab.list", "pane.list", "pane.current", "pane.read", "pane.wait_for_output", "pane.close", "pane.send_text", "pane.send_keys", "pane.rename", "agent.list", "agent.start", "agent.prompt", "agent.wait", "agent.read", "agent.focus", "agent.send_keys"];
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

test("registers no Herdr tools outside Herdr", async () => {
  delete process.env.HERDR_ENV;
  const pi = createPi(() => success("ok"));

  await loadExtension(pi);

  expect(pi.tools).toHaveLength(0);
  expect(pi.calls).toHaveLength(0);
});

test("fails compatibility before topology mutation when Herdr lacks a required schema capability", async () => {
  enableHerdr();
  const pi = createPi((_command, args) => {
    if (args.join(" ") === "--version") return { code: 0, stdout: "herdr 0.8.2\n", stderr: "" };
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

test("herdr_list combines the caller workspace topology and detected agents", async () => {
  enableHerdr();
  const pi = createPi((_command, args) => {
    const command = args.join(" ");
    if (command === "--version") return { code: 0, stdout: "herdr 0.8.2\n", stderr: "" };
    if (command === "workspace list") return success("workspace_list", { workspaces: [{ workspace_id: "w1", label: "project", number: 1, focused: true, pane_count: 1, tab_count: 1, active_tab_id: "w1:t1", agent_status: "working" }] });
    if (command === "tab list --workspace w1") return success("tab_list", { tabs: [{ tab_id: "w1:t1", workspace_id: "w1", label: "main", number: 1, focused: true, pane_count: 1, agent_status: "working" }] });
    if (command === "pane list --workspace w1") return success("pane_list", { panes: [{ pane_id: "w1:p1", terminal_id: "term_1", workspace_id: "w1", tab_id: "w1:t1", focused: true, agent_status: "working", revision: 1, terminal_title: "Pi" }] });
    if (command === "agent list") return success("agent_list", { agents: [{ name: "reviewer", pane_id: "w1:p1", terminal_id: "term_1", workspace_id: "w1", tab_id: "w1:t1", focused: true, agent_status: "working", revision: 1 }] });
    throw new Error(`Unexpected Herdr argv: ${command}`);
  });

  await loadExtension(pi);
  const result = await tool(pi, "herdr_list").execute("test", {});

  expect(result.details).toEqual({
    allWorkspaces: false,
    workspaces: [{ workspace_id: "w1", label: "project", number: 1, focused: true, pane_count: 1, tab_count: 1, active_tab_id: "w1:t1", agent_status: "working" }],
    tabs: [{ tab_id: "w1:t1", workspace_id: "w1", label: "main", number: 1, focused: true, pane_count: 1, agent_status: "working" }],
    panes: [{ pane_id: "w1:p1", terminal_id: "term_1", workspace_id: "w1", tab_id: "w1:t1", focused: true, agent_status: "working", revision: 1, terminal_title: "Pi" }],
    agents: [{ name: "reviewer", pane_id: "w1:p1", terminal_id: "term_1", workspace_id: "w1", tab_id: "w1:t1", focused: true, agent_status: "working", revision: 1 }],
  });
  expect(pi.calls.map((call) => call.args.join(" "))).toContain("pane list --workspace w1");
});

test("herdr_run creates an unfocused current-workspace tab then atomically starts its command", async () => {
  enableHerdr();
  const pi = createPi((_command, args) => {
    if (args.join(" ") === "--version") return { code: 0, stdout: "herdr 0.8.2\n", stderr: "" };
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
    if (args.join(" ") === "--version") return { code: 0, stdout: "herdr 0.8.2\n", stderr: "" };
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
    if (args.join(" ") === "--version") return { code: 0, stdout: "herdr 0.8.2\n", stderr: "" };
    if (args.join(" ") === "pane current --current") return success("pane_current", { pane: { pane_id: "w2:p7", terminal_id: "term_caller", workspace_id: "w2", tab_id: "w2:t1", focused: true, agent_status: "working", revision: 4 } });
    throw new Error(`Unexpected Herdr argv: ${args.join(" ")}`);
  });

  await loadExtension(pi);

  await expect(tool(pi, "herdr_close").execute("test", { pane_id: "w2:p7" })).rejects.toThrow("Refusing to close the Pi caller pane");
  expect(pi.calls.map((call) => call.args.join(" "))).not.toContain("pane close w2:p7");
});

test("herdr_pane_output returns Pi-truncated recent output and Herdr identifiers", async () => {
  enableHerdr();
  const pi = createPi((_command, args) => {
    if (args.join(" ") === "--version") return { code: 0, stdout: "herdr 0.8.2\n", stderr: "" };
    if (args.join(" ") === "pane read w1:p2 --source recent-unwrapped --lines 40") {
      return { code: 0, stdout: "server ready", stderr: "" };
    }
    throw new Error(`Unexpected Herdr argv: ${args.join(" ")}`);
  });

  await loadExtension(pi);
  const result = await tool(pi, "herdr_pane_output").execute("test", { pane_id: "w1:p2", lines: 40 });

  expect(result.content[0].text).toContain("server ready");
  expect(result.details).toMatchObject({ paneId: "w1:p2", source: "recent-unwrapped", truncated: false });
});

test("herdr_wait_for_output distinguishes an output match from transport failure", async () => {
  enableHerdr();
  const pi = createPi((_command, args) => {
    if (args.join(" ") === "--version") return { code: 0, stdout: "herdr 0.8.2\n", stderr: "" };
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
    if (args.join(" ") === "--version") return { code: 0, stdout: "herdr 0.8.2\n", stderr: "" };
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
    if (args.join(" ") === "--version") return { code: 0, stdout: "herdr 0.8.2\n", stderr: "" };
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
    if (args.join(" ") === "--version") return { code: 0, stdout: "herdr 0.8.2\n", stderr: "" };
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
    if (args.join(" ") === "--version") return { code: 0, stdout: "herdr 0.8.2\n", stderr: "" };
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
    if (args.join(" ") === "--version") return { code: 0, stdout: "herdr 0.8.2\n", stderr: "" };
    if (args.join(" ") === "agent start reviewer --kind codex --pane w1:p1 --timeout 30000") return { code: 0, stdout: "", stderr: "", killed: true };
    throw new Error(`Unexpected Herdr argv: ${args.join(" ")}`);
  });

  await loadExtension(pi);

  await expect(tool(pi, "herdr_agent_start").execute("test", { name: "reviewer", kind: "codex", pane_id: "w1:p1" })).rejects.toThrow("HERDR_CANCELLED");
});

test("herdr_agent_start returns created topology when cancellation follows tab creation", async () => {
  enableHerdr();
  const pi = createPi((_command, args) => {
    if (args.join(" ") === "--version") return { code: 0, stdout: "herdr 0.8.2\n", stderr: "" };
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
    if (args.join(" ") === "--version") return { code: 0, stdout: "herdr 0.8.2\n", stderr: "" };
    if (args.join(" ") === "agent wait reviewer --until idle --timeout 10") {
      return { code: 1, stdout: "", stderr: JSON.stringify({ error: { code: "agent_not_found", message: "No live agent reviewer" } }) };
    }
    throw new Error(`Unexpected Herdr argv: ${args.join(" ")}`);
  });

  await loadExtension(pi);

  await expect(tool(pi, "herdr_agent_wait").execute("test", { target: "reviewer", until: ["idle"], timeout_ms: 10 })).rejects.toThrow("HERDR_SERVER_ERROR: No live agent reviewer");
});
