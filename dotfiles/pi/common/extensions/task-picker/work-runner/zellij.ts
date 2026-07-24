import type { CommandExecutor } from "./types.ts";

interface TabRecord {
  tab_id?: number;
  name?: string;
}

interface PaneRecord {
  id?: number | string;
  tab_id?: number;
  is_plugin?: boolean;
}

function parsePanes(output: string): PaneRecord[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error("zellij list-panes returned malformed JSON");
  }
  if (!Array.isArray(parsed)) throw new Error("zellij list-panes returned an unexpected JSON shape");
  return parsed as PaneRecord[];
}

function normalizePaneId(value: string | number): string {
  const text = String(value).trim();
  if (/^terminal_\d+$/.test(text)) return text;
  if (/^\d+$/.test(text)) return `terminal_${text}`;
  throw new Error(`zellij returned an invalid terminal pane ID: ${text}`);
}

async function tabs(exec: CommandExecutor): Promise<TabRecord[]> {
  const result = await exec("zellij", ["action", "list-tabs", "--json"], { timeout: 10_000 });
  if (result.code !== 0) throw new Error((result.stderr || result.stdout).trim() || "zellij list-tabs failed");
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new Error("zellij list-tabs returned malformed JSON");
  }
  if (!Array.isArray(parsed)) throw new Error("zellij list-tabs returned an unexpected JSON shape");
  return parsed as TabRecord[];
}

async function panes(exec: CommandExecutor): Promise<PaneRecord[]> {
  const result = await exec("zellij", ["action", "list-panes", "--json"], { timeout: 10_000 });
  if (result.code !== 0) throw new Error((result.stderr || result.stdout).trim() || "zellij list-panes failed");
  return parsePanes(result.stdout);
}

function paneExists(records: PaneRecord[], tabId: number, paneId: string): boolean {
  return records.some((pane) =>
    pane.tab_id === tabId &&
    pane.is_plugin !== true &&
    pane.id !== undefined &&
    normalizePaneId(pane.id) === paneId
  );
}

export interface ZellijLaunchInput {
  leasePath: string;
  tabName: string;
  recordPath: string;
  workerPolicyPath: string;
  statusPanePath: string;
  prompt: string;
}

export interface ZellijEndpoint {
  tabId: number;
  workerPaneId?: string;
  statusPaneId?: string;
}

export interface ZellijLaunchResult extends ZellijEndpoint {
  workerPaneId: string;
  statusPaneId: string;
}

export async function launchZellijTask(
  exec: CommandExecutor,
  input: ZellijLaunchInput,
  onEndpoint: (endpoint: ZellijEndpoint) => Promise<void> = async () => {}
): Promise<ZellijLaunchResult> {
  if ((await tabs(exec)).some((tab) => tab.name === input.tabName)) {
    throw new Error(`zellij tab ${input.tabName} already exists`);
  }

  const tabResult = await exec(
    "zellij",
    [
      "action", "new-tab",
      "--cwd", input.leasePath,
      "--name", input.tabName,
      "--start-suspended",
      "--",
      "env",
      `TASK_PICKER_RUN_FILE=${input.recordPath}`,
      "TASK_PICKER_ISOLATED_RUN=1",
      "pi",
      "--name", input.tabName,
      "--extension", input.workerPolicyPath,
      input.prompt,
    ],
    { timeout: 15_000 }
  );
  if (tabResult.code !== 0) {
    throw new Error((tabResult.stderr || tabResult.stdout).trim() || "zellij new-tab failed");
  }
  const tabText = tabResult.stdout.trim();
  if (!/^\d+$/.test(tabText)) throw new Error(`zellij returned an invalid tab ID: ${tabText || "empty"}`);
  const tabId = Number(tabText);
  await onEndpoint({ tabId });

  const afterTab = await panes(exec);
  const worker = afterTab.find((pane) => pane.tab_id === tabId && pane.is_plugin !== true && pane.id !== undefined);
  if (worker?.id === undefined) throw new Error(`zellij did not create a terminal worker pane in tab ${tabId}`);
  const workerPaneId = normalizePaneId(worker.id);
  await onEndpoint({ tabId, workerPaneId });

  const statusResult = await exec(
    "zellij",
    [
      "action", "new-pane",
      "--tab-id", String(tabId),
      "--direction", "right",
      "--cwd", input.leasePath,
      "--name", "status",
      "--",
      "env",
      `TASK_PICKER_RUN_FILE=${input.recordPath}`,
      "node",
      input.statusPanePath,
    ],
    { timeout: 15_000 }
  );
  if (statusResult.code !== 0) {
    throw new Error((statusResult.stderr || statusResult.stdout).trim() || "zellij new-pane failed");
  }
  const statusPaneId = normalizePaneId(statusResult.stdout);
  if (!(await panes(exec)).some((pane) => paneExists([pane], tabId, statusPaneId))) {
    throw new Error(`zellij status pane ${statusPaneId} was not found in tab ${tabId}`);
  }
  await onEndpoint({ tabId, workerPaneId, statusPaneId });

  const startResult = await exec(
    "zellij",
    ["action", "send-keys", "--pane-id", workerPaneId, "Enter"],
    { timeout: 10_000 }
  );
  if (startResult.code !== 0) {
    throw new Error((startResult.stderr || startResult.stdout).trim() || "zellij failed to start worker pane");
  }

  return { tabId, workerPaneId, statusPaneId };
}
