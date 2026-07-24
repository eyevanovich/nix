import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { createGitLabBackend, type GitLabProjectIdentity } from "../adapters/gitlab.ts";
import type { TrackerDetection, TrackerProvider } from "../api.ts";

interface ProcessResult {
  status: number | null;
  stdout?: string;
  stderr?: string;
  error?: Error;
}

export interface GitLabProviderDependencies {
  resolveGitRoot(cwd: string): ProcessResult;
}

const DEFAULT_DEPENDENCIES: GitLabProviderDependencies = {
  resolveGitRoot(cwd) {
    const result = spawnSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
    });
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      error: result.error,
    };
  },
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function field(record: JsonRecord, names: string[]): string | undefined {
  for (const name of names) {
    const value = record[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function numericField(record: JsonRecord, names: string[]): number | undefined {
  for (const name of names) {
    const value = record[name];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function parseProject(output: string, root: string): GitLabProjectIdentity {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error("GitLab project lookup returned malformed JSON.");
  }
  if (!isRecord(parsed)) throw new Error("GitLab project lookup returned an unexpected JSON shape.");

  const path = field(parsed, ["path_with_namespace", "pathWithNamespace", "full_path", "fullPath"]);
  const webUrl = field(parsed, ["web_url", "webUrl"]);
  if (!path) throw new Error("GitLab project lookup did not include a canonical project path.");

  let host: string | undefined;
  if (webUrl) {
    try {
      host = new URL(webUrl).host;
    } catch {
      throw new Error("GitLab project lookup returned an invalid web URL.");
    }
  }
  host ??= field(parsed, ["host"]);
  if (!host) throw new Error("GitLab project lookup did not include a canonical host.");

  return {
    root,
    host,
    path,
    canonicalId: `${host}/${path}`,
    webUrl,
    numericId: numericField(parsed, ["id"]),
  };
}

function detailsOf(result: { stdout?: string; stderr?: string }): string {
  return (result.stderr || result.stdout || "").trim();
}

function unavailableFromProjectError(details: string): TrackerDetection {
  const normalized = details.toLowerCase();
  if (/not a gitlab|no gitlab remotes?|could not determine.*repo|repository.*not found/.test(normalized)) {
    return { kind: "not-applicable", message: `No GitLab project could be resolved. ${details}`.trim() };
  }
  if (/401|unauthorized|authentication|not authenticated/.test(normalized)) {
    return { kind: "unavailable", message: "GitLab authentication failed. Run glab auth login for this repository host." };
  }
  if (/403|forbidden|permission|access denied/.test(normalized)) {
    return { kind: "unavailable", message: `GitLab project access was denied. ${details}`.trim() };
  }
  if (/timeout|timed out|network|connection|dns|temporary|unreachable/.test(normalized)) {
    return { kind: "unavailable", message: `GitLab project lookup failed because of a network error. ${details}`.trim() };
  }
  return { kind: "unavailable", message: `GitLab project lookup failed. ${details}`.trim() };
}

export function createGitLabProvider(
  pi: ExtensionAPI,
  promptPaths: string[],
  dependencies: GitLabProviderDependencies = DEFAULT_DEPENDENCIES
): TrackerProvider {
  const projects = new Map<string, GitLabProjectIdentity>();

  async function exec(args: string[], cwd: string) {
    try {
      return await pi.exec("glab", args, { cwd, timeout: 30_000 });
    } catch (error) {
      return { code: -1, stdout: "", stderr: error instanceof Error ? error.message : String(error) };
    }
  }

  return {
    id: "gitlab",
    label: "GitLab",
    promptPaths,
    async detect(cwd: string): Promise<TrackerDetection> {
      const rootResult = dependencies.resolveGitRoot(cwd);
      if (rootResult.error || rootResult.status !== 0 || !rootResult.stdout?.trim()) {
        return { kind: "not-applicable", message: "The current directory is not inside a Git repository." };
      }
      const root = resolve(rootResult.stdout.trim());

      const version = await exec(["version"], root);
      if (version.code !== 0) {
        const details = detailsOf(version);
        return {
          kind: "unavailable",
          message: `The glab CLI is unavailable. Install glab or add it to PATH.${details ? ` (${details})` : ""}`,
        };
      }

      const auth = await exec(["auth", "status"], root);
      if (auth.code !== 0) {
        return {
          kind: "unavailable",
          message: "GitLab authentication failed for the current repository context. Run glab auth login.",
        };
      }

      const projectResult = await exec(["repo", "view", "--output", "json"], root);
      if (projectResult.code !== 0) return unavailableFromProjectError(detailsOf(projectResult));

      let project: GitLabProjectIdentity;
      try {
        project = parseProject(projectResult.stdout, root);
      } catch (error) {
        return { kind: "unavailable", message: error instanceof Error ? error.message : String(error) };
      }
      projects.set(root, project);
      return {
        kind: "ready",
        repository: { root, canonicalId: project.canonicalId },
      };
    },
    async connect(cwd: string) {
      const rootResult = dependencies.resolveGitRoot(cwd);
      const root = rootResult.stdout?.trim() ? resolve(rootResult.stdout.trim()) : resolve(cwd);
      let project = projects.get(root);
      if (!project) {
        const detection = await this.detect(cwd);
        if (detection.kind !== "ready") throw new Error(detection.message);
        project = projects.get(detection.repository.root);
      }
      if (!project) throw new Error("GitLab project identity was not available after detection.");
      return createGitLabBackend(pi, project);
    },
  };
}
