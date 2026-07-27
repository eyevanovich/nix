import type { CommandExecutor } from "./types.ts";

export interface PreflightResult {
  primaryRoot: string;
  activeTabId: number;
}

function parseTabs(output: string): Array<Record<string, unknown>> | null {
  try {
    const parsed: unknown = JSON.parse(output);
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "object" && item !== null)) {
      return null;
    }
    return parsed as Array<Record<string, unknown>>;
  } catch {
    return null;
  }
}

async function succeeds(exec: CommandExecutor, command: string, args: string[]): Promise<boolean> {
  try {
    return (await exec(command, args, { timeout: 10_000 })).code === 0;
  } catch {
    return false;
  }
}

export async function preflightIsolatedRun(
  exec: CommandExecutor,
  cwd: string,
  env: NodeJS.ProcessEnv
): Promise<PreflightResult | null> {
  if (!env.ZELLIJ) return null;

  let treehouse;
  let noMistakesRun;
  let noMistakesRespond;
  try {
    [treehouse, noMistakesRun, noMistakesRespond] = await Promise.all([
      exec("treehouse", ["get", "--help"], { timeout: 10_000 }),
      exec("no-mistakes", ["axi", "run", "--help"], { timeout: 10_000 }),
      exec("no-mistakes", ["axi", "respond", "--help"], { timeout: 10_000 }),
    ]);
  } catch {
    return null;
  }
  const treehouseHelp = treehouse.stdout.concat(treehouse.stderr);
  if (
    treehouse.code !== 0 ||
    !treehouseHelp.includes("--lease") ||
    !treehouseHelp.includes("--lease-holder")
  ) return null;
  if (
    noMistakesRun.code !== 0 ||
    !noMistakesRun.stdout.concat(noMistakesRun.stderr).includes("--intent") ||
    noMistakesRespond.code !== 0
  ) return null;
  if (!(await succeeds(exec, "pi", ["--version"]))) return null;
  if (!(await succeeds(exec, "zellij", ["--version"]))) return null;

  let tabsResult;
  let rootResult;
  try {
    tabsResult = await exec("zellij", ["action", "list-tabs", "--json"], { timeout: 10_000 });
    rootResult = await exec("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { timeout: 10_000 });
  } catch {
    return null;
  }
  const tabs = tabsResult.code === 0 ? parseTabs(tabsResult.stdout) : null;
  const primaryRoot = rootResult.code === 0 ? rootResult.stdout.trim() : "";
  if (!tabs || !primaryRoot) return null;
  try {
    const noMistakesHome = await exec("no-mistakes", ["axi"], {
      cwd: primaryRoot,
      timeout: 10_000,
    });
    if (noMistakesHome.code !== 0) return null;
  } catch {
    return null;
  }

  const active = tabs.find((tab) => tab.active === true);
  const activeTabId = active?.tab_id;
  if (
    typeof activeTabId !== "number" ||
    !Number.isSafeInteger(activeTabId) ||
    activeTabId < 0
  ) return null;
  return { primaryRoot, activeTabId };
}
