import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Task, TaskStatus } from "../../models/task.ts";
import {
  PartialTaskCreateError,
  type CreateTaskInput,
  type TaskStatusMap,
  type TaskUpdate,
  type TrackerBackend,
} from "../api.ts";

const PAGE_SIZE = 100;
const STATUS_MAP = { open: "opened", closed: "closed" } satisfies TaskStatusMap;

export interface GitLabProjectIdentity {
  root: string;
  host: string;
  path: string;
  canonicalId: string;
  webUrl?: string;
  numericId?: number;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(output: string, context: string): unknown {
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`Malformed JSON from glab ${context}.`);
  }
}

function parseJsonArray(output: string, context: string): JsonRecord[] {
  const parsed = parseJson(output, context);
  if (!Array.isArray(parsed) || !parsed.every(isRecord)) {
    throw new Error(`Unexpected JSON shape from glab ${context}: expected an array.`);
  }
  return parsed;
}

function parseJsonObject(output: string, context: string): JsonRecord {
  const parsed = parseJson(output, context);
  if (!isRecord(parsed)) {
    throw new Error(`Unexpected JSON shape from glab ${context}: expected an object.`);
  }
  return parsed;
}

function stringField(record: JsonRecord, names: string[]): string | undefined {
  for (const name of names) {
    const value = record[name];
    if (typeof value === "string") return value;
    if (typeof value === "number") return String(value);
  }
  return undefined;
}

function numberField(record: JsonRecord, names: string[]): number | undefined {
  for (const name of names) {
    const value = record[name];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function normalizeLabels(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const labels = value.flatMap((entry) => {
    if (typeof entry === "string") return [entry];
    if (!isRecord(entry)) return [];
    const label = stringField(entry, ["title", "name"]);
    return label ? [label] : [];
  });
  return labels.length ? labels : undefined;
}

function normalizeAssignees(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const assignees = value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const username = stringField(entry, ["username", "name"]);
    return username ? [username] : [];
  });
  return assignees.length ? assignees : undefined;
}

function normalizeIssue(project: GitLabProjectIdentity, issue: JsonRecord, context: string): Task {
  const iid = stringField(issue, ["iid"]);
  const title = stringField(issue, ["title"]);
  const state = stringField(issue, ["state"]);
  if (!iid || !/^\d+$/.test(iid)) {
    throw new Error(`Malformed GitLab issue JSON from ${context}: missing or invalid iid.`);
  }
  if (!title) throw new Error(`Malformed GitLab issue JSON from ${context}: missing title.`);
  if (state !== "opened" && state !== "closed") {
    throw new Error(`Malformed GitLab issue JSON from ${context}: unsupported state ${state ?? "missing"}.`);
  }

  const labels = normalizeLabels(issue.labels);
  const assignees = normalizeAssignees(issue.assignees);
  const milestone = isRecord(issue.milestone)
    ? stringField(issue.milestone, ["title"])
    : undefined;
  const ref = `${project.canonicalId}#${iid}`;
  const task: Task = {
    ref,
    id: `#${iid}`,
    title,
    description: stringField(issue, ["description"]) ?? "",
    status: state === "closed" ? "closed" : "open",
    labels,
    assignee: assignees?.join(", "),
    dueAt: stringField(issue, ["due_date", "dueDate"]),
    createdAt: stringField(issue, ["created_at", "createdAt"]),
    updatedAt: stringField(issue, ["updated_at", "updatedAt"]),
    gitlab: {
      project: project.canonicalId,
      iid: Number(iid),
      webUrl: stringField(issue, ["web_url", "webUrl"]),
      assignees,
      milestone,
      weight: numberField(issue, ["weight"]),
      issueType: stringField(issue, ["issue_type", "issueType", "type"]),
    },
  };
  return task;
}

function iidFromRef(ref: string): string {
  const match = ref.match(/#(\d+)$/) ?? ref.match(/^(\d+)$/);
  if (!match) throw new Error(`Invalid GitLab issue reference: ${ref}`);
  return match[1];
}

function repositoryUrl(project: GitLabProjectIdentity): string {
  if (project.webUrl) return project.webUrl.replace(/\/$/, "");
  const url = new URL(`https://${project.host}`);
  url.pathname = project.path;
  return url.toString().replace(/\/$/, "");
}

function issueUrl(project: GitLabProjectIdentity, item: Task): string {
  if (item.gitlab?.webUrl) return item.gitlab.webUrl;
  const iid = item.gitlab?.iid?.toString() ?? iidFromRef(item.ref);
  return `${repositoryUrl(project)}/-/issues/${iid}`;
}

export function createGitLabBackend(
  pi: ExtensionAPI,
  project: GitLabProjectIdentity
): TrackerBackend {
  const repo = repositoryUrl(project);

  async function execGlab(args: string[], context: string, timeout = 30_000): Promise<string> {
    let result;
    try {
      result = await pi.exec("glab", args, { cwd: project.root, timeout });
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      throw new Error(`glab ${context} failed: ${details}`);
    }
    if (result.code !== 0) {
      const details = (result.stderr || result.stdout || "").trim();
      throw new Error(details || `glab ${context} failed (code ${result.code}).`);
    }
    return result.stdout;
  }

  async function show(ref: string): Promise<Task> {
    const iid = iidFromRef(ref);
    const output = await execGlab(
      ["issue", "view", iid, "--output", "json", "--repo", repo],
      `issue view ${iid}`
    );
    return normalizeIssue(project, parseJsonObject(output, `issue view ${iid}`), `issue view ${iid}`);
  }

  async function hydrateAfterMutation(ref: string, operation: string): Promise<Task> {
    try {
      return await show(ref);
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      throw new Error(`${operation} succeeded, but refreshing the GitLab issue failed: ${details}`);
    }
  }

  async function mutateStatus(ref: string, status: TaskStatus): Promise<void> {
    if (status !== "open" && status !== "closed") {
      throw new Error(`Unsupported GitLab issue status: ${status}`);
    }
    const iid = iidFromRef(ref);
    const operation = status === "closed" ? "close" : "reopen";
    await execGlab(["issue", operation, iid, "--repo", repo], `issue ${operation} ${iid}`);
  }

  async function update(ref: string, update: TaskUpdate): Promise<void> {
    const iid = iidFromRef(ref);
    const args = ["issue", "update", iid];
    if (update.title !== undefined) args.push("--title", update.title.trim());
    if (update.description !== undefined) args.push("--description", update.description);
    if (update.priority !== undefined || update.taskType !== undefined || update.dueAt !== undefined) {
      throw new Error("GitLab editing supports only title, description, and open/closed state.");
    }
    let fieldsUpdated = false;
    if (args.length > 3) {
      args.push("--repo", repo);
      await execGlab(args, `issue update ${iid}`);
      fieldsUpdated = true;
    }
    if (update.status !== undefined) {
      try {
        await mutateStatus(iid, update.status);
      } catch (error) {
        if (!fieldsUpdated) throw error;
        const details = error instanceof Error ? error.message : String(error);
        throw new Error(`GitLab issue fields were updated, but changing state failed: ${details}`);
      }
    }
    if (fieldsUpdated || update.status !== undefined) {
      await hydrateAfterMutation(iid, "GitLab issue update");
    }
  }

  async function changeStatus(ref: string, status: TaskStatus): Promise<void> {
    const iid = iidFromRef(ref);
    await mutateStatus(iid, status);
    await hydrateAfterMutation(iid, `GitLab issue ${status === "closed" ? "close" : "reopen"}`);
  }

  return {
    id: "gitlab",
    label: "GitLab",
    statusMap: STATUS_MAP,
    taskTypes: [],
    priorities: [],
    async list(): Promise<Task[]> {
      const tasks: Task[] = [];
      for (let page = 1; ; page += 1) {
        const output = await execGlab(
          [
            "issue",
            "list",
            "--output",
            "json",
            "--page",
            String(page),
            "--per-page",
            String(PAGE_SIZE),
            "--repo",
            repo,
          ],
          `issue list page ${page}`
        );
        const issues = parseJsonArray(output, `issue list page ${page}`);
        tasks.push(...issues.map((issue) => normalizeIssue(project, issue, `issue list page ${page}`)));
        if (issues.length < PAGE_SIZE) break;
      }
      return tasks;
    },
    show,
    actions: {
      async create(input: CreateTaskInput): Promise<Task> {
        if (input.priority !== undefined || input.taskType !== undefined || input.dueAt !== undefined) {
          throw new Error("GitLab creation supports only title, description, and open/closed state.");
        }
        if (input.status !== undefined && input.status !== "open" && input.status !== "closed") {
          throw new Error(`Unsupported GitLab issue status: ${input.status}`);
        }
        const args = [
          "api",
          "projects/:fullpath/issues",
          "--hostname",
          project.host,
          "--method",
          "POST",
          "--raw-field",
          `title=${input.title.trim()}`,
          "--raw-field",
          `description=${input.description ?? ""}`,
          "--output",
          "json",
        ];
        const output = await execGlab(args, "api create issue");
        const created = normalizeIssue(project, parseJsonObject(output, "api create issue"), "api create issue");
        if (input.status === "closed") {
          try {
            await mutateStatus(created.ref, "closed");
          } catch (error) {
            let persisted = created;
            try {
              persisted = await show(created.ref);
            } catch {
              // Keep the complete create response when best-effort hydration also fails.
            }
            throw new PartialTaskCreateError(persisted, "closed", error);
          }
        }
        try {
          return await show(created.ref);
        } catch (error) {
          throw new PartialTaskCreateError(created, input.status, error, "refresh");
        }
      },
      update,
      changeStatus,
      startWork: async (item) => ({ prompt: `/execute-gitlab-issue ${issueUrl(project, item)}` }),
    },
  };
}
