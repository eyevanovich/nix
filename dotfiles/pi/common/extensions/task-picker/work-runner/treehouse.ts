import { isAbsolute, resolve } from "node:path";
import { realpath } from "node:fs/promises";
import type { CommandExecutor } from "./types.ts";

function processError(command: string, result: { code: number; stdout: string; stderr: string }): Error {
  const detail = (result.stderr || result.stdout).trim();
  return new Error(detail || `${command} failed with code ${result.code}`);
}

async function gitOutput(exec: CommandExecutor, cwd: string, args: string[]): Promise<string> {
  const result = await exec("git", ["-C", cwd, ...args], { timeout: 15_000 });
  if (result.code !== 0) throw processError(`git ${args.join(" ")}`, result);
  return result.stdout.trim();
}

export async function acquireTreehouseLease(
  exec: CommandExecutor,
  primaryRoot: string,
  holder: string
): Promise<string> {
  const result = await exec(
    "treehouse",
    ["get", "--lease", "--lease-holder", holder],
    { cwd: primaryRoot, timeout: 60_000 }
  );
  if (result.code !== 0) throw processError("treehouse get --lease", result);
  const lines = result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length !== 1 || !isAbsolute(lines[0]!)) {
    throw new Error("treehouse get --lease did not return exactly one absolute worktree path");
  }
  return lines[0]!;
}

export async function attestLease(
  exec: CommandExecutor,
  primaryRoot: string,
  leasePath: string,
  canonicalize: (path: string) => Promise<string> = realpath
): Promise<string> {
  const [physicalPrimary, physicalLease] = await Promise.all([
    canonicalize(primaryRoot),
    canonicalize(leasePath),
  ]);
  if (physicalLease === physicalPrimary) {
    throw new Error("treehouse returned the primary checkout instead of an isolated worktree");
  }

  const topLevelRaw = await gitOutput(exec, physicalLease, ["rev-parse", "--show-toplevel"]);
  const topLevel = await canonicalize(topLevelRaw);
  if (topLevel !== physicalLease) throw new Error("leased path is not its own Git top-level");

  const [gitDirRaw, commonDirRaw, primaryCommonDirRaw] = await Promise.all([
    gitOutput(exec, physicalLease, ["rev-parse", "--absolute-git-dir"]),
    gitOutput(exec, physicalLease, ["rev-parse", "--git-common-dir"]),
    gitOutput(exec, physicalPrimary, ["rev-parse", "--git-common-dir"]),
  ]);
  const commonDirPath = isAbsolute(commonDirRaw) ? commonDirRaw : resolve(physicalLease, commonDirRaw);
  const primaryCommonDirPath = isAbsolute(primaryCommonDirRaw)
    ? primaryCommonDirRaw
    : resolve(physicalPrimary, primaryCommonDirRaw);
  const [gitDir, commonDir, primaryCommonDir] = await Promise.all([
    canonicalize(gitDirRaw),
    canonicalize(commonDirPath),
    canonicalize(primaryCommonDirPath),
  ]);
  if (gitDir === commonDir) throw new Error("leased checkout is not a linked Git worktree");
  if (commonDir !== primaryCommonDir) {
    throw new Error("leased worktree belongs to a different Git repository");
  }

  const status = await gitOutput(exec, physicalLease, ["status", "--porcelain"]);
  if (status) throw new Error("leased worktree is not clean");
  return physicalLease;
}

export async function createTaskBranch(
  exec: CommandExecutor,
  leasePath: string,
  branch: string
): Promise<void> {
  const result = await exec("git", ["-C", leasePath, "switch", "-c", branch], { timeout: 15_000 });
  if (result.code !== 0) throw processError(`git switch -c ${branch}`, result);
}
