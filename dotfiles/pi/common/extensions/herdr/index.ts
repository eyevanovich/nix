import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  truncateTail,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

type JsonRecord = Record<string, unknown>;
type HerdrStatus = "idle" | "working" | "blocked" | "done" | "unknown";
type ReadSource = "visible" | "recent" | "recent-unwrapped" | "detection";

type CallerContext = {
  binary: string;
  workspaceId: string;
  tabId: string;
  paneId: string;
};

type HerdrTopology = {
  workspaceId: string;
  tabId: string;
  paneId: string;
  terminalId?: string;
};

class HerdrError extends Error {
  constructor(
    readonly code:
      | "HERDR_CANCELLED"
      | "HERDR_CLI_USAGE"
      | "HERDR_CONTEXT_ERROR"
      | "HERDR_PROTOCOL_ERROR"
      | "HERDR_SERVER_ERROR"
      | "HERDR_UNSUPPORTED",
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "HerdrError";
  }
}

function getRequiredEnvironment(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value === "" ? undefined : value;
}

function callerContext(): CallerContext | undefined {
  if (process.env.HERDR_ENV !== "1") return undefined;

  const binary = getRequiredEnvironment("HERDR_BIN_PATH");
  const workspaceId = getRequiredEnvironment("HERDR_WORKSPACE_ID");
  const tabId = getRequiredEnvironment("HERDR_TAB_ID");
  const paneId = getRequiredEnvironment("HERDR_PANE_ID");
  if (!binary || !workspaceId || !tabId || !paneId) return undefined;

  return { binary, workspaceId, tabId, paneId };
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true || (isRecord(error) && error.name === "AbortError");
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asStatus(value: unknown): HerdrStatus | undefined {
  return value === "idle" || value === "working" || value === "blocked" || value === "done" || value === "unknown"
    ? value
    : undefined;
}

function validStatuses(values: string[] | undefined, field: string): HerdrStatus[] | undefined {
  if (!values) return undefined;
  const statuses = values.map(asStatus);
  if (statuses.some((status) => status === undefined)) {
    throw new HerdrError("HERDR_CONTEXT_ERROR", `${field} accepts only idle, working, blocked, done, or unknown.`);
  }
  return statuses as HerdrStatus[];
}

function renderErrorMessage(result: { stdout: string; stderr: string }): string {
  const source = result.stderr.trim() || result.stdout.trim();
  if (!source) return "Herdr returned no error details.";

  try {
    const decoded: unknown = JSON.parse(source);
    if (isRecord(decoded)) {
      const error = isRecord(decoded.error) ? decoded.error : decoded;
      const message = asString(error.message);
      if (message) return message;
    }
  } catch {
    // Herdr usage errors can be plain text; preserve the meaningful first line.
  }

  return source.split("\n", 1)[0] ?? "Herdr returned an unrecognised error.";
}

function jsonEnvelope(stdout: string, operation: string): JsonRecord {
  let decoded: unknown;
  try {
    decoded = JSON.parse(stdout);
  } catch {
    throw new HerdrError("HERDR_PROTOCOL_ERROR", `${operation} returned malformed JSON.`);
  }

  if (!isRecord(decoded) || !isRecord(decoded.result) || typeof decoded.result.type !== "string") {
    throw new HerdrError("HERDR_PROTOCOL_ERROR", `${operation} returned an unexpected JSON envelope.`);
  }

  return decoded.result;
}

function resultWithType(result: JsonRecord, type: string, operation: string): JsonRecord {
  if (result.type !== type) {
    throw new HerdrError("HERDR_PROTOCOL_ERROR", `${operation} returned ${String(result.type)} instead of ${type}.`);
  }
  return result;
}

function requiredRecord(value: unknown, field: string, operation: string): JsonRecord {
  if (!isRecord(value)) {
    throw new HerdrError("HERDR_PROTOCOL_ERROR", `${operation} did not return ${field}.`);
  }
  return value;
}

function requiredString(value: unknown, field: string, operation: string): string {
  const string = asString(value);
  if (!string) {
    throw new HerdrError("HERDR_PROTOCOL_ERROR", `${operation} did not return ${field}.`);
  }
  return string;
}

function topologyFromPane(pane: JsonRecord, operation: string): HerdrTopology {
  return {
    workspaceId: requiredString(pane.workspace_id, "workspace_id", operation),
    tabId: requiredString(pane.tab_id, "tab_id", operation),
    paneId: requiredString(pane.pane_id, "pane_id", operation),
    terminalId: asString(pane.terminal_id),
  };
}

function textResult(text: string, details: JsonRecord): { content: Array<{ type: "text"; text: string }>; details: JsonRecord } {
  return { content: [{ type: "text", text }], details };
}

function statusSummary(agent: JsonRecord): HerdrStatus | "unknown" {
  return asStatus(agent.agent_status) ?? "unknown";
}

class HerdrClient {
  private capabilities: Promise<void> | undefined;

  constructor(
    private readonly pi: ExtensionAPI,
    private readonly caller: CallerContext,
  ) {}

  async run(args: string[], signal?: AbortSignal, timeout?: number): Promise<JsonRecord> {
    if (signal?.aborted) throw new HerdrError("HERDR_CANCELLED", "The operation was cancelled before Herdr was called.");

    let result;
    try {
      result = await this.pi.exec(this.caller.binary, args, { signal, timeout });
    } catch (error) {
      if (isAbort(error, signal)) throw new HerdrError("HERDR_CANCELLED", "The Herdr operation was cancelled.");
      throw error;
    }

      if (signal?.aborted || result.killed) {
      throw new HerdrError("HERDR_CANCELLED", "The Herdr operation was cancelled.");
    }
    if (result.code === 1) {
      throw new HerdrError("HERDR_SERVER_ERROR", renderErrorMessage(result));
    }
    if (result.code === 2) {
      throw new HerdrError("HERDR_CLI_USAGE", renderErrorMessage(result));
    }
    if (result.code !== 0) {
      throw new HerdrError("HERDR_SERVER_ERROR", renderErrorMessage(result));
    }

    return jsonEnvelope(result.stdout, `herdr ${args.join(" ")}`);
  }

  async runRaw(args: string[], signal?: AbortSignal, timeout?: number): Promise<string> {
    if (signal?.aborted) throw new HerdrError("HERDR_CANCELLED", "The operation was cancelled before Herdr was called.");

    let result;
    try {
      result = await this.pi.exec(this.caller.binary, args, { signal, timeout });
    } catch (error) {
      if (isAbort(error, signal)) throw new HerdrError("HERDR_CANCELLED", "The Herdr operation was cancelled.");
      throw error;
    }

    if (signal?.aborted || result.killed) throw new HerdrError("HERDR_CANCELLED", "The Herdr operation was cancelled.");
    if (result.code === 1) throw new HerdrError("HERDR_SERVER_ERROR", renderErrorMessage(result));
    if (result.code === 2) throw new HerdrError("HERDR_CLI_USAGE", renderErrorMessage(result));
    if (result.code !== 0) throw new HerdrError("HERDR_SERVER_ERROR", renderErrorMessage(result));
    return result.stdout;
  }

  async ensureCapabilities(signal?: AbortSignal): Promise<void> {
    if (!this.capabilities) {
      this.capabilities = this.probeCapabilities(signal).catch((error) => {
        this.capabilities = undefined;
        throw error;
      });
    }
    return this.capabilities;
  }

  private async probeCapabilities(signal?: AbortSignal): Promise<void> {
    let version;
    try {
      version = await this.pi.exec(this.caller.binary, ["--version"], { signal, timeout: 5_000 });
    } catch (error) {
      if (isAbort(error, signal)) throw new HerdrError("HERDR_CANCELLED", "The compatibility probe was cancelled.");
      throw new HerdrError("HERDR_UNSUPPORTED", "Could not execute HERDR_BIN_PATH.");
    }

    if (signal?.aborted || version.killed) throw new HerdrError("HERDR_CANCELLED", "The compatibility probe was cancelled.");
    if (version.code !== 0) throw new HerdrError("HERDR_UNSUPPORTED", renderErrorMessage(version));
    if (!/^herdr\s+0\.8\.2\s*$/m.test(version.stdout)) {
      throw new HerdrError("HERDR_UNSUPPORTED", `Expected Herdr 0.8.2; received ${version.stdout.trim() || "an unrecognised version"}.`);
    }

    for (const args of CLI_CAPABILITY_PROBES) {
      try {
        const help = await this.pi.exec(this.caller.binary, args, { signal, timeout: 5_000 });
        if (signal?.aborted || help.killed) throw new HerdrError("HERDR_CANCELLED", "The compatibility probe was cancelled.");
        if (help.code !== 0) throw new HerdrError("HERDR_UNSUPPORTED", renderErrorMessage(help));
      } catch (error) {
        if (error instanceof HerdrError) throw error;
        if (isAbort(error, signal)) throw new HerdrError("HERDR_CANCELLED", "The compatibility probe was cancelled.");
        throw new HerdrError("HERDR_UNSUPPORTED", `Could not inspect Herdr ${args.join(" ")}.`);
      }
    }

    let schema;
    try {
      schema = await this.pi.exec(this.caller.binary, ["api", "schema", "--json"], { signal, timeout: 5_000 });
    } catch (error) {
      if (isAbort(error, signal)) throw new HerdrError("HERDR_CANCELLED", "The compatibility probe was cancelled.");
      throw new HerdrError("HERDR_UNSUPPORTED", "Could not read the Herdr CLI schema.");
    }
    if (signal?.aborted || schema.killed) throw new HerdrError("HERDR_CANCELLED", "The compatibility probe was cancelled.");
    if (schema.code !== 0) throw new HerdrError("HERDR_UNSUPPORTED", renderErrorMessage(schema));

    let decoded: unknown;
    try {
      decoded = JSON.parse(schema.stdout);
    } catch {
      throw new HerdrError("HERDR_UNSUPPORTED", "Herdr api schema returned malformed JSON.");
    }
    const methods = collectSchemaMethods(decoded);
    const missing = REQUIRED_METHODS.filter((method) => !methods.has(method));
    if (missing.length > 0) {
      throw new HerdrError("HERDR_UNSUPPORTED", `Herdr 0.8.2 is missing required CLI capabilities: ${missing.join(", ")}.`);
    }
  }

  async command(args: string[], signal?: AbortSignal, timeout?: number): Promise<JsonRecord> {
    await this.ensureCapabilities(signal);
    return this.run(args, signal, timeout);
  }
}

const CLI_CAPABILITY_PROBES: string[][] = [["pane", "run", "--help"]];

const REQUIRED_METHODS = [
  "workspace.list",
  "tab.create",
  "tab.close",
  "tab.list",
  "pane.list",
  "pane.current",
  "pane.read",
  "pane.wait_for_output",
  "pane.close",
  "pane.send_text",
  "pane.send_keys",
  "pane.rename",
  "agent.list",
  "agent.start",
  "agent.prompt",
  "agent.wait",
  "agent.read",
  "agent.focus",
  "agent.send_keys",
] as const;

function collectSchemaMethods(value: unknown, methods = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectSchemaMethods(item, methods);
  } else if (isRecord(value)) {
    const method = isRecord(value.properties) && isRecord(value.properties.method)
      ? asString(value.properties.method.const)
      : undefined;
    if (method) methods.add(method);
    for (const child of Object.values(value)) collectSchemaMethods(child, methods);
  }
  return methods;
}

function appendOption(args: string[], flag: string, value: string | number | undefined): void {
  if (value === undefined) return;
  args.push(flag, String(value));
}

function appendRepeatedOption(args: string[], flag: string, values: string[] | undefined): void {
  for (const value of values ?? []) args.push(flag, value);
}

function appendReadOptions(args: string[], source: ReadSource, lines?: number, format?: "text" | "ansi"): void {
  args.push("--source", source);
  appendOption(args, "--lines", lines);
  if (format === "ansi") args.push("--format", "ansi");
}

function renderRead(result: JsonRecord, operation: string): { text: string; details: JsonRecord } {
  const read = requiredRecord(result.read, "read", operation);
  return renderReadText(requiredString(read.text, "read.text", operation), {
    paneId: requiredString(read.pane_id, "read.pane_id", operation),
    tabId: requiredString(read.tab_id, "read.tab_id", operation),
    workspaceId: requiredString(read.workspace_id, "read.workspace_id", operation),
    source: read.source,
    format: read.format,
    revision: read.revision,
    herdrTruncated: read.truncated === true,
  });
}

function renderReadText(text: string, details: JsonRecord): { text: string; details: JsonRecord } {
  const truncation = truncateTail(text, { maxBytes: DEFAULT_MAX_BYTES, maxLines: DEFAULT_MAX_LINES });
  return {
    text: truncation.content,
    details: {
      ...details,
      truncated: truncation.truncated,
      totalLines: truncation.totalLines,
      outputLines: truncation.outputLines,
      totalBytes: truncation.totalBytes,
      outputBytes: truncation.outputBytes,
    },
  };
}

export default function registerHerdrExtension(pi: ExtensionAPI): void {
  const caller = callerContext();
  if (!caller) return;

  const herdr = new HerdrClient(pi, caller);
  void pruneStaleRunners();

  pi.registerTool({
    name: "herdr_list",
    label: "Herdr List",
    description: "List Herdr workspaces, tabs, panes, and recognized agents. Defaults to the calling workspace; set all_workspaces to inspect every workspace.",
    promptSnippet: "Discover current Herdr workspaces, tabs, panes, and agents",
    parameters: Type.Object({
      all_workspaces: Type.Optional(Type.Boolean({ description: "Inspect all Herdr workspaces instead of only the caller workspace." })),
    }),
    async execute(_id, params, signal) {
      const allWorkspaces = params.all_workspaces === true;
      const workspacesResult = resultWithType(await herdr.command(["workspace", "list"], signal, 5_000), "workspace_list", "workspace list");
      const workspaces = Array.isArray(workspacesResult.workspaces) ? workspacesResult.workspaces : undefined;
      if (!workspaces || !workspaces.every(isRecord)) {
        throw new HerdrError("HERDR_PROTOCOL_ERROR", "workspace list did not return workspaces.");
      }

      const scopedWorkspaces = allWorkspaces
        ? workspaces
        : workspaces.filter((workspace) => workspace.workspace_id === caller.workspaceId);
      if (!allWorkspaces && scopedWorkspaces.length !== 1) {
        throw new HerdrError("HERDR_PROTOCOL_ERROR", `Herdr did not return caller workspace ${caller.workspaceId}.`);
      }

      const tabs: JsonRecord[] = [];
      const panes: JsonRecord[] = [];
      for (const workspace of scopedWorkspaces) {
        const workspaceId = requiredString(workspace.workspace_id, "workspace_id", "workspace list");
        const tabResult = resultWithType(await herdr.command(["tab", "list", "--workspace", workspaceId], signal, 5_000), "tab_list", "tab list");
        const paneResult = resultWithType(await herdr.command(["pane", "list", "--workspace", workspaceId], signal, 5_000), "pane_list", "pane list");
        if (!Array.isArray(tabResult.tabs) || !tabResult.tabs.every(isRecord)) {
          throw new HerdrError("HERDR_PROTOCOL_ERROR", "tab list did not return tabs.");
        }
        if (!Array.isArray(paneResult.panes) || !paneResult.panes.every(isRecord)) {
          throw new HerdrError("HERDR_PROTOCOL_ERROR", "pane list did not return panes.");
        }
        tabs.push(...tabResult.tabs);
        panes.push(...paneResult.panes);
      }

      const agentResult = resultWithType(await herdr.command(["agent", "list"], signal, 5_000), "agent_list", "agent list");
      if (!Array.isArray(agentResult.agents) || !agentResult.agents.every(isRecord)) {
        throw new HerdrError("HERDR_PROTOCOL_ERROR", "agent list did not return agents.");
      }
      const workspaceIds = new Set(scopedWorkspaces.map((workspace) => workspace.workspace_id));
      const agents = allWorkspaces
        ? agentResult.agents
        : agentResult.agents.filter((agent) => workspaceIds.has(agent.workspace_id));

      return textResult(
        `Herdr: ${scopedWorkspaces.length} workspace(s), ${tabs.length} tab(s), ${panes.length} pane(s), ${agents.length} recognized agent(s).`,
        { allWorkspaces, workspaces: scopedWorkspaces, tabs, panes, agents },
      );
    },
  });

  pi.registerTool({
    name: "herdr_run",
    label: "Herdr Run",
    description: "Run a command in a dedicated, unfocused Herdr tab in the caller workspace. The command persists after this tool returns.",
    promptSnippet: "Run persistent work in a dedicated Herdr tab",
    promptGuidelines: ["Use herdr_run for visible long-running commands such as servers and watchers; it creates background work without focusing it."],
    executionMode: "sequential",
    parameters: Type.Object({
      command: Type.String({ description: "Command text submitted atomically to the new pane." }),
      label: Type.Optional(Type.String({ description: "Human-readable work-tab label." })),
      cwd: Type.Optional(Type.String({ description: "Explicit working directory. Defaults to Pi's current cwd." })),
      close_on_exit: Type.Optional(Type.Boolean({ description: "Close the work pane when its command exits." })),
      start_suspended: Type.Optional(Type.Boolean({ description: "Stage the command as literal text without submitting Enter." })),
    }),
    async execute(_id, params, signal, _update, ctx) {
      const cwd = params.cwd ?? ctx.cwd;
      const created = await createWorkTab(herdr, caller, cwd, params.label, signal);

      try {
        if (params.start_suspended) {
          await herdr.command(["pane", "send-text", created.paneId, params.command], signal, 10_000);
        } else if (params.close_on_exit) {
          const runner = await createCommandRunner(params.command, ctx.cwd, params.cwd, caller.binary, true);
          try {
            await herdr.runRaw(["pane", "run", created.paneId, shellQuote(runner.runnerPath)], signal, 10_000);
          } catch (error) {
            await runner.cleanup();
            throw error;
          }
        } else {
          await herdr.runRaw(["pane", "run", created.paneId, params.command], signal, 10_000);
        }
      } catch (error) {
        if (error instanceof HerdrError && error.code === "HERDR_CANCELLED") {
          return textResult(
            `Command submission was cancelled. Tab ${created.tabId} and pane ${created.paneId} may still be available.`,
            { ...created, command: params.command, cancelled: true, workMayBeRunning: true },
          );
        }

        const rollback = await closeCompletedWork(herdr, created.tabId);
        const message = error instanceof Error ? error.message : String(error);
        throw new HerdrError("HERDR_SERVER_ERROR", `${message}${rollback ? ` Rollback failed: ${rollback}` : " The unused tab was closed."}`);
      }

      return textResult(
        `${params.start_suspended ? "Staged" : "Started"} command in Herdr tab ${created.tabId}, pane ${created.paneId}.`,
        { ...created, command: params.command, label: params.label, closeOnExit: params.close_on_exit === true, startSuspended: params.start_suspended === true },
      );
    },
  });

  pi.registerTool({
    name: "herdr_run_and_wait",
    label: "Herdr Run & Wait",
    description: "Run a command in a dedicated Herdr tab, wait for its command-correlated completion, read output, and close the completed tab. A timeout or cancellation leaves the work available for inspection.",
    promptSnippet: "Run a command in a Herdr tab and wait for its exit status",
    promptGuidelines: ["Use herdr_run_and_wait when a command outcome is needed but the command should remain visibly isolated while it runs."],
    executionMode: "sequential",
    parameters: Type.Object({
      command: Type.String({ description: "Command to run." }),
      label: Type.Optional(Type.String({ description: "Human-readable work-tab label." })),
      cwd: Type.Optional(Type.String({ description: "Explicit working directory. Defaults to Pi's current cwd." })),
      timeout_ms: Type.Optional(Type.Integer({ minimum: 1, description: "Maximum wait in milliseconds. Timeout does not kill the command." })),
    }),
    async execute(_id, params, signal, _update, ctx) {
      const runner = await createCommandRunner(params.command, ctx.cwd, params.cwd, caller.binary);
      let launched: (HerdrTopology & { tabId: string }) | undefined;
      let preserveRunner = false;
      try {
        launched = await launchRunner(herdr, caller, runner, params.label, signal);
        const completion = await waitForStatusFile(runner.statusPath, params.timeout_ms ?? 120_000, signal);

        if (completion.kind !== "completed") {
          preserveRunner = true;
          return textResult(
            completion.kind === "cancelled"
              ? `Cancelled while waiting. Tab ${launched.tabId} and pane ${launched.paneId} may still be running.`
              : `Timed out after ${params.timeout_ms ?? 120_000}ms. Tab ${launched.tabId} and pane ${launched.paneId} may still be running.`,
            { ...launched, status: completion.kind, workMayBeRunning: true },
          );
        }

        const output = await readPaneOutput(herdr, launched.paneId, "recent-unwrapped", undefined, signal);
        const cleanupWarning = await closeCompletedWork(herdr, launched.tabId);
        return textResult(
          `Exit code: ${completion.exitCode}\n\n${output.text}${cleanupWarning ? `\n\nCleanup warning: ${cleanupWarning}` : ""}`,
          { ...launched, exitCode: completion.exitCode, status: "completed", output: output.details, cleanupWarning },
        );
      } finally {
        if (!preserveRunner) await runner.cleanup();
      }
    },
  });

  pi.registerTool({
    name: "herdr_pane_output",
    label: "Herdr Pane Output",
    description: "Read a Herdr pane using visible, recent, recent-unwrapped, or detection output. Output is truncated to Pi's standard limits.",
    promptSnippet: "Read Herdr pane output by opaque pane ID",
    parameters: Type.Object({
      pane_id: Type.String({ description: "Authoritative Herdr pane ID." }),
      source: Type.Optional(Type.Union([Type.Literal("visible"), Type.Literal("recent"), Type.Literal("recent-unwrapped"), Type.Literal("detection")])),
      lines: Type.Optional(Type.Integer({ minimum: 0, description: "Requested number of available terminal rows." })),
      format: Type.Optional(Type.Union([Type.Literal("text"), Type.Literal("ansi")])),
    }),
    async execute(_id, params, signal) {
      const output = await readPaneOutput(herdr, params.pane_id, params.source ?? "recent-unwrapped", params.lines, signal, params.format ?? "text");
      return textResult(`Pane ${params.pane_id} output:\n${output.text}`, output.details);
    },
  });

  pi.registerTool({
    name: "herdr_wait_for_output",
    label: "Herdr Wait For Output",
    description: "Wait for literal text or a regular expression in Herdr pane output. Herdr searches existing output immediately; use a unique marker when correlation matters.",
    promptSnippet: "Wait for literal text or a regex in Herdr pane output",
    promptGuidelines: ["Use herdr_wait_for_output for readiness signals; existing pane output can match immediately, so use a unique marker when command correlation matters."],
    executionMode: "sequential",
    parameters: Type.Object({
      pane_id: Type.String({ description: "Authoritative Herdr pane ID." }),
      match: Type.String({ description: "Literal text or regular-expression pattern to wait for." }),
      regex: Type.Optional(Type.Boolean({ description: "Interpret match as a Herdr Rust regular expression." })),
      source: Type.Optional(Type.Union([Type.Literal("visible"), Type.Literal("recent"), Type.Literal("recent-unwrapped")])),
      lines: Type.Optional(Type.Integer({ minimum: 0 })),
      timeout_ms: Type.Optional(Type.Integer({ minimum: 1, description: "Maximum wait in milliseconds." })),
    }),
    async execute(_id, params, signal) {
      const args = ["pane", "wait-output", params.pane_id, params.regex ? "--regex" : "--match", params.match];
      appendReadOptions(args, params.source ?? "recent-unwrapped", params.lines);
      appendOption(args, "--timeout", params.timeout_ms);

      try {
        const result = resultWithType(await herdr.command(args, signal, params.timeout_ms === undefined ? undefined : params.timeout_ms + 5_000), "output_matched", "pane wait-output");
        const output = renderRead(result, "pane wait-output");
        return textResult(
          `Matched ${params.regex ? "regular expression" : "text"} in pane ${params.pane_id}.\n\n${output.text}`,
          { ...output.details, paneId: params.pane_id, matched: true, matchedText: asString(result.matched_line), status: "matched" },
        );
      } catch (error) {
        if (error instanceof HerdrError && error.code === "HERDR_CANCELLED") {
          return textResult(`Cancelled while waiting for output in pane ${params.pane_id}.`, { paneId: params.pane_id, matched: false, status: "cancelled" });
        }
        if (error instanceof HerdrError && error.code === "HERDR_SERVER_ERROR" && /timeout/i.test(error.message)) {
          return textResult(`Timed out waiting for output in pane ${params.pane_id}.`, { paneId: params.pane_id, matched: false, status: "timeout" });
        }
        throw error;
      }
    },
  });

  pi.registerTool({
    name: "herdr_close",
    label: "Herdr Close Pane",
    description: "Close a Herdr pane by opaque ID. Refuses to close the pane hosting the current Pi process.",
    promptSnippet: "Close a Herdr pane while protecting the current Pi pane",
    parameters: Type.Object({
      pane_id: Type.String({ description: "Authoritative Herdr pane ID to close." }),
    }),
    async execute(_id, params, signal) {
      const current = resultWithType(await herdr.command(["pane", "current", "--current"], signal, 5_000), "pane_current", "pane current");
      const canonicalCaller = requiredRecord(current.pane, "pane", "pane current");
      const callerTopology = topologyFromPane(canonicalCaller, "pane current");
      if (params.pane_id === caller.paneId || params.pane_id === callerTopology.paneId || (callerTopology.terminalId && params.pane_id === callerTopology.terminalId)) {
        throw new HerdrError("HERDR_CONTEXT_ERROR", "Refusing to close the Pi caller pane.");
      }

      resultWithType(await herdr.command(["pane", "close", params.pane_id], signal, 10_000), "pane_closed", "pane close");
      return textResult(`Closed pane ${params.pane_id}.`, { paneId: params.pane_id });
    },
  });

  pi.registerTool({
    name: "herdr_send_keys",
    label: "Herdr Send Pane Input",
    description: "Send literal text without Enter and/or validated logical keys to a raw Herdr pane.",
    promptSnippet: "Send text or logical keys to a Herdr pane",
    parameters: Type.Object({
      pane_id: Type.String({ description: "Authoritative Herdr pane ID." }),
      text: Type.Optional(Type.String({ description: "Literal text to send without submitting Enter." })),
      keys: Type.Optional(Type.Array(Type.String({ description: "Logical key such as enter, esc, or ctrl+c." }))),
    }),
    async execute(_id, params, signal) {
      if (params.text === undefined && (!params.keys || params.keys.length === 0)) {
        throw new HerdrError("HERDR_CONTEXT_ERROR", "Provide text, keys, or both.");
      }
      if (params.text !== undefined) await herdr.command(["pane", "send-text", params.pane_id, params.text], signal, 10_000);
      if (params.keys && params.keys.length > 0) await herdr.command(["pane", "send-keys", params.pane_id, ...params.keys], signal, 10_000);
      return textResult(`Sent input to pane ${params.pane_id}.`, { paneId: params.pane_id, text: params.text, keys: params.keys });
    },
  });

  pi.registerTool({
    name: "herdr_rename_pane",
    label: "Herdr Rename Pane",
    description: "Rename a Herdr pane by opaque ID.",
    promptSnippet: "Rename a Herdr pane",
    parameters: Type.Object({
      pane_id: Type.String({ description: "Authoritative Herdr pane ID." }),
      label: Type.String({ description: "New pane label." }),
    }),
    async execute(_id, params, signal) {
      await herdr.command(["pane", "rename", params.pane_id, params.label], signal, 10_000);
      return textResult(`Renamed pane ${params.pane_id} to ${params.label}.`, { paneId: params.pane_id, label: params.label });
    },
  });

  pi.registerTool({
    name: "herdr_agent_start",
    label: "Herdr Agent Start",
    description: "Start a recognized coding agent in a dedicated, unfocused Herdr tab, or use an explicitly supplied shell pane.",
    promptSnippet: "Start a recognized coding agent in Herdr",
    executionMode: "sequential",
    parameters: Type.Object({
      name: Type.String({ description: "Unique agent name matching Herdr's naming rules." }),
      kind: Type.String({ description: "Installed Herdr-supported coding-agent kind." }),
      args: Type.Optional(Type.Array(Type.String({ description: "Native agent argument; forwarded after Herdr's -- separator." }))),
      pane_id: Type.Optional(Type.String({ description: "Existing available shell pane. Omit to create a dedicated tab." })),
      label: Type.Optional(Type.String({ description: "Dedicated work-tab label when pane_id is omitted." })),
      cwd: Type.Optional(Type.String({ description: "Dedicated tab working directory. Defaults to Pi's cwd." })),
      timeout_ms: Type.Optional(Type.Integer({ minimum: 3_001, maximum: 300_000, description: "Agent startup timeout in milliseconds." })),
    }),
    async execute(_id, params, signal, _update, ctx) {
      let topology: HerdrTopology | undefined;
      let tabId: string | undefined;
      if (params.pane_id) {
        topology = { workspaceId: caller.workspaceId, tabId: caller.tabId, paneId: params.pane_id };
      } else {
        const createArgs = ["tab", "create", "--workspace", caller.workspaceId, "--cwd", params.cwd ?? ctx.cwd];
        appendOption(createArgs, "--label", params.label);
        createArgs.push("--no-focus");
        const created = resultWithType(await herdr.command(createArgs, signal, 10_000), "tab_created", "tab create");
        const pane = requiredRecord(created.root_pane, "root_pane", "tab create");
        topology = topologyFromPane(pane, "tab create");
        tabId = requiredString(requiredRecord(created.tab, "tab", "tab create").tab_id, "tab.tab_id", "tab create");
      }

      const args = ["agent", "start", params.name, "--kind", params.kind, "--pane", topology.paneId];
      appendOption(args, "--timeout", params.timeout_ms ?? 30_000);
      if (params.args && params.args.length > 0) args.push("--", ...params.args);

      try {
        const started = resultWithType(await herdr.command(args, signal, (params.timeout_ms ?? 30_000) + 5_000), "agent_started", "agent start");
        const agent = requiredRecord(started.agent, "agent", "agent start");
        const authoritativeTopology = topologyFromPane(agent, "agent start");
        return textResult(
          `Started ${params.kind} agent ${params.name} in pane ${authoritativeTopology.paneId}.`,
          { ...authoritativeTopology, tabId: authoritativeTopology.tabId, agent, argv: started.argv },
        );
      } catch (error) {
        if (error instanceof HerdrError && error.code === "HERDR_CANCELLED") {
          if (params.pane_id) throw error;
          return textResult(
            `Agent startup was cancelled. Tab ${tabId ?? topology.tabId} and pane ${topology.paneId} may still contain work.`,
            { ...topology, tabId: tabId ?? topology.tabId, agentName: params.name, status: "cancelled", cancelled: true, workMayBeRunning: true },
          );
        }
        const message = error instanceof Error ? error.message : String(error);
        return textResult(
          `Agent ${params.name} may have started but is not ready: ${message}`,
          { ...topology, tabId: tabId ?? topology.tabId, agentName: params.name, status: "unknown", partial: true, error: message },
        );
      }
    },
  });

  pi.registerTool({
    name: "herdr_agent_prompt",
    label: "Herdr Agent Prompt",
    description: "Prompt a recognized Herdr agent, optionally waiting in the same lifecycle-aware request. Waiting observes lifecycle state, not an individual conversational turn.",
    promptSnippet: "Prompt a recognized Herdr agent and optionally wait for lifecycle state",
    executionMode: "sequential",
    parameters: Type.Object({
      target: Type.String({ description: "Live Herdr agent name or hosting pane ID." }),
      prompt: Type.String({ description: "Prompt submitted through Herdr's agent interface." }),
      wait: Type.Optional(Type.Boolean({ description: "Wait in the same Herdr request." })),
      until: Type.Optional(Type.Array(Type.String({ description: "Exact lifecycle state to wait for." }))),
      timeout_ms: Type.Optional(Type.Integer({ minimum: 1, description: "Wait timeout in milliseconds." })),
    }),
    async execute(_id, params, signal) {
      const args = ["agent", "prompt", params.target, params.prompt];
      const until = validStatuses(params.until, "until");
      if (params.wait) {
        args.push("--wait");
        appendRepeatedOption(args, "--until", until);
        appendOption(args, "--timeout", params.timeout_ms);
      }
      const result = resultWithType(await herdr.command(args, signal, params.timeout_ms === undefined ? undefined : params.timeout_ms + 5_000), "agent_prompted", "agent prompt");
      const agent = requiredRecord(result.agent, "agent", "agent prompt");
      return textResult(
        `Prompted agent ${params.target}${params.wait ? `; lifecycle state is ${statusSummary(agent)}.` : "."}`,
        { target: params.target, agent, status: statusSummary(agent), waited: params.wait === true, until },
      );
    },
  });

  pi.registerTool({
    name: "herdr_agent_wait",
    label: "Herdr Agent Wait",
    description: "Wait for a recognized Herdr agent's occupant-pinned lifecycle state.",
    promptSnippet: "Wait for a Herdr agent lifecycle state",
    executionMode: "sequential",
    parameters: Type.Object({
      target: Type.String({ description: "Live Herdr agent name or hosting pane ID." }),
      until: Type.Optional(Type.Array(Type.String({ description: "Exact desired lifecycle state." }))),
      timeout_ms: Type.Optional(Type.Integer({ minimum: 1, description: "Maximum wait in milliseconds." })),
    }),
    async execute(_id, params, signal) {
      const args = ["agent", "wait", params.target];
      const until = validStatuses(params.until, "until");
      appendRepeatedOption(args, "--until", until);
      appendOption(args, "--timeout", params.timeout_ms);
      try {
        const result = resultWithType(await herdr.command(args, signal, params.timeout_ms === undefined ? undefined : params.timeout_ms + 5_000), "agent_info", "agent wait");
        const agent = requiredRecord(result.agent, "agent", "agent wait");
        return textResult(`Agent ${params.target} reached ${statusSummary(agent)}.`, { target: params.target, agent, status: statusSummary(agent), until });
      } catch (error) {
        if (error instanceof HerdrError && error.code === "HERDR_CANCELLED") {
          return textResult(`Cancelled while waiting for agent ${params.target}.`, { target: params.target, status: "cancelled" });
        }
        throw error;
      }
    },
  });

  pi.registerTool({
    name: "herdr_agent_read",
    label: "Herdr Agent Read",
    description: "Read a recognized Herdr agent through its agent-aware transcript interface. Output is truncated to Pi's standard limits.",
    promptSnippet: "Read a recognized Herdr agent transcript",
    parameters: Type.Object({
      target: Type.String({ description: "Live Herdr agent name or hosting pane ID." }),
      source: Type.Optional(Type.Union([Type.Literal("visible"), Type.Literal("recent"), Type.Literal("recent-unwrapped"), Type.Literal("detection")])),
      lines: Type.Optional(Type.Integer({ minimum: 0 })),
      format: Type.Optional(Type.Union([Type.Literal("text"), Type.Literal("ansi")])),
    }),
    async execute(_id, params, signal) {
      const args = ["agent", "read", params.target];
      appendReadOptions(args, params.source ?? "recent-unwrapped", params.lines, params.format ?? "text");
      const output = await readAgentOutput(herdr, params.target, args, params.source ?? "recent-unwrapped", params.format ?? "text", signal);
      return textResult(`Agent ${params.target} transcript:\n${output.text}`, { target: params.target, ...output.details });
    },
  });

  pi.registerTool({
    name: "herdr_agent_focus",
    label: "Herdr Agent Focus",
    description: "Explicitly focus a recognized Herdr agent. This may mark unseen done work as idle.",
    promptSnippet: "Focus a recognized Herdr agent",
    parameters: Type.Object({
      target: Type.String({ description: "Live Herdr agent name or hosting pane ID." }),
    }),
    async execute(_id, params, signal) {
      const result = resultWithType(await herdr.command(["agent", "focus", params.target], signal, 10_000), "agent_info", "agent focus");
      const agent = requiredRecord(result.agent, "agent", "agent focus");
      return textResult(`Focused agent ${params.target}.`, { target: params.target, agent, status: statusSummary(agent) });
    },
  });

  pi.registerTool({
    name: "herdr_agent_send_keys",
    label: "Herdr Agent Send Keys",
    description: "Send validated logical keys to a recognized Herdr agent after Herdr verifies its live identity.",
    promptSnippet: "Send logical keys to a recognized Herdr agent",
    parameters: Type.Object({
      target: Type.String({ description: "Live Herdr agent name or hosting pane ID." }),
      keys: Type.Array(Type.String({ description: "Logical key such as enter, esc, or ctrl+c." }), { minItems: 1 }),
    }),
    async execute(_id, params, signal) {
      await herdr.command(["agent", "send-keys", params.target, ...params.keys], signal, 10_000);
      return textResult(`Sent keys to agent ${params.target}.`, { target: params.target, keys: params.keys });
    },
  });
}

async function readPaneOutput(
  herdr: HerdrClient,
  paneId: string,
  source: ReadSource,
  lines: number | undefined,
  signal?: AbortSignal,
  format: "text" | "ansi" = "text",
): Promise<{ text: string; details: JsonRecord }> {
  const args = ["pane", "read", paneId];
  appendReadOptions(args, source, lines, format);
  await herdr.ensureCapabilities(signal);

  let result;
  try {
    result = await herdr.run(args, signal, 10_000);
    return renderRead(resultWithType(result, "pane_read", "pane read"), "pane read");
  } catch (error) {
    if (!(error instanceof HerdrError) || error.code !== "HERDR_PROTOCOL_ERROR") throw error;

    let text;
    try {
      text = await herdr.runRaw(args, signal, 10_000);
    } catch {
      throw error;
    }
    return renderReadText(text, { paneId, source, format, herdrTruncated: false });
  }
}

async function readAgentOutput(
  herdr: HerdrClient,
  target: string,
  args: string[],
  source: ReadSource,
  format: "text" | "ansi",
  signal?: AbortSignal,
): Promise<{ text: string; details: JsonRecord }> {
  await herdr.ensureCapabilities(signal);
  try {
    return renderRead(resultWithType(await herdr.run(args, signal, 10_000), "pane_read", "agent read"), "agent read");
  } catch (error) {
    if (!(error instanceof HerdrError) || error.code !== "HERDR_PROTOCOL_ERROR") throw error;
    const text = await herdr.runRaw(args, signal, 10_000);
    return renderReadText(text, { target, source, format, herdrTruncated: false });
  }
}

async function createWorkTab(
  herdr: HerdrClient,
  caller: CallerContext,
  cwd: string,
  label: string | undefined,
  signal?: AbortSignal,
): Promise<HerdrTopology & { tabId: string }> {
  const createArgs = ["tab", "create", "--workspace", caller.workspaceId, "--cwd", cwd];
  appendOption(createArgs, "--label", label);
  createArgs.push("--no-focus");

  const created = resultWithType(await herdr.command(createArgs, signal, 10_000), "tab_created", "tab create");
  const tab = requiredRecord(created.tab, "tab", "tab create");
  const pane = requiredRecord(created.root_pane, "root_pane", "tab create");
  return { ...topologyFromPane(pane, "tab create"), tabId: requiredString(tab.tab_id, "tab.tab_id", "tab create") };
}

async function closeCompletedWork(herdr: HerdrClient, tabId: string): Promise<string | undefined> {
  try {
    await herdr.command(["tab", "close", tabId], undefined, 5_000);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

type CommandRunner = {
  directory: string;
  cwd: string;
  runnerPath: string;
  statusPath: string;
  cleanup: () => Promise<void>;
};

async function createCommandRunner(
  command: string,
  defaultCwd: string,
  requestedCwd: string | undefined,
  herdrBinary: string,
  closeOnExit = false,
): Promise<CommandRunner> {
  const { chmod, mkdtemp, rm, writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");

  const directory = await mkdtemp(join(tmpdir(), "pi-herdr-"));
  const commandPath = join(directory, "command.sh");
  const runnerPath = join(directory, "runner.sh");
  const statusPath = join(directory, "status");
  const heartbeatPath = join(directory, "heartbeat");
  const cwd = requestedCwd ?? defaultCwd;
  const quoted = shellQuote;
  const closeCommand = closeOnExit
    ? `${quoted(herdrBinary)} pane close \"$HERDR_PANE_ID\" >/dev/null 2>&1 || true`
    : "";

  const commandScript = `#! /bin/sh\ncd ${quoted(cwd)} || exit 125\nexec /bin/sh -c ${quoted(command)}\n`;
  const runnerScript = [
    "#! /bin/sh",
    "set +e",
    `touch ${quoted(heartbeatPath)}`,
    `(while :; do touch ${quoted(heartbeatPath)}; sleep 3600; done) &`,
    "heartbeat_pid=$!",
    "trap 'kill \"$heartbeat_pid\" 2>/dev/null || true' EXIT",
    `/bin/sh ${quoted(commandPath)}`,
    "status=$?",
    `tmp=${quoted(`${statusPath}.tmp`)}`,
    `printf '%s\\n' \"$status\" > \"$tmp\" && mv \"$tmp\" ${quoted(statusPath)}`,
    ...(closeCommand ? [
      `kill \"$heartbeat_pid\" 2>/dev/null || true`,
      `wait \"$heartbeat_pid\" 2>/dev/null || true`,
      `rm -f ${quoted(commandPath)} ${quoted(statusPath)} ${quoted(heartbeatPath)} \"$0\"`,
      `rmdir ${quoted(directory)} 2>/dev/null || true`,
      closeCommand,
    ] : [`rm -f ${quoted(commandPath)} \"$0\"`]),
    "exit \"$status\"",
    "",
  ].join("\n");

  try {
    await writeFile(commandPath, commandScript, { encoding: "utf8", mode: 0o700 });
    await writeFile(runnerPath, runnerScript, { encoding: "utf8", mode: 0o700 });
    await chmod(commandPath, 0o700);
    await chmod(runnerPath, 0o700);
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }

  return {
    directory,
    cwd,
    runnerPath,
    statusPath,
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

async function pruneStaleRunners(): Promise<void> {
  const { readdir, rm, stat } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const staleBefore = Date.now() - 24 * 60 * 60 * 1_000;
  try {
    const names = await readdir(tmpdir());
    await Promise.all(names.filter((name) => name.startsWith("pi-herdr-")).map(async (name) => {
      const path = join(tmpdir(), name);
      try {
        const heartbeatPath = join(path, "heartbeat");
        const lastActivity = await stat(heartbeatPath).then((heartbeat) => heartbeat.mtimeMs, async () => (await stat(path)).mtimeMs);
        if (lastActivity < staleBefore) await rm(path, { recursive: true, force: true });
      } catch {
        // A runner may finish or disappear while this best-effort pruning runs.
      }
    }));
  } catch {
    // Failure to prune extension-owned temporary directories must not block Herdr tools.
  }
}

async function launchRunner(
  herdr: HerdrClient,
  caller: CallerContext,
  runner: CommandRunner,
  label: string | undefined,
  signal?: AbortSignal,
): Promise<HerdrTopology & { tabId: string }> {
  const created = await createWorkTab(herdr, caller, runner.cwd, label, signal);

  try {
    await herdr.runRaw(["pane", "run", created.paneId, shellQuote(runner.runnerPath)], signal, 10_000);
  } catch (error) {
    const rollback = await closeCompletedWork(herdr, created.tabId);
    await runner.cleanup();
    const message = error instanceof Error ? error.message : String(error);
    throw new HerdrError("HERDR_SERVER_ERROR", `${message}${rollback ? ` Rollback failed: ${rollback}` : ""}`);
  }

  return created;
}

async function waitForStatusFile(
  statusPath: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<{ kind: "completed"; exitCode: number } | { kind: "cancelled" | "timeout" }> {
  const { readFile } = await import("node:fs/promises");
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (signal?.aborted) return { kind: "cancelled" };
    try {
      const raw = (await readFile(statusPath, "utf8")).trim();
      if (/^-?\d+$/.test(raw)) return { kind: "completed", exitCode: Number(raw) };
    } catch {
      // The runner has not yet atomically published its status.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return signal?.aborted ? { kind: "cancelled" } : { kind: "timeout" };
}
