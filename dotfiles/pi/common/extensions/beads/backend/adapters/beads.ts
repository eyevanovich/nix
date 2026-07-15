import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Task, TaskDependency, TaskStatus } from "../../models/task.ts";
import { PartialTaskCreateError } from "../api.ts";
import type {
  CreateTaskInput,
  TaskAdapter,
  TaskAdapterCapability,
  TaskAdapterInitializer,
  TaskStatusMap,
  TaskUpdate,
} from "../api.ts";

const MAX_LIST_RESULTS = 100;
const STATUS_MAP = {
  open: "open",
  inProgress: "in_progress",
  blocked: "blocked",
  deferred: "deferred",
  closed: "closed",
} satisfies TaskStatusMap;
const BUILT_IN_TASK_TYPES = ["task", "feature", "bug", "chore", "epic", "decision"];
const ACTIVE_BACKEND_STATUSES = ["open", "in_progress", "blocked"];
const ACTIVE_TASK_STATUSES: TaskStatus[] = ["open", "inProgress", "blocked"];
const PRIORITIES = ["p0", "p1", "p2", "p3", "p4"];
const PRIORITY_HOTKEYS: Record<string, string> = {
  "0": "p0",
  "1": "p1",
  "2": "p2",
  "3": "p3",
  "4": "p4",
};

function makeListArgs(): string[] {
  return [
    "list",
    "--status",
    ACTIVE_BACKEND_STATUSES.join(","),
    "--limit",
    String(MAX_LIST_RESULTS),
    "--json",
  ];
}

interface BeadsConfigValue {
  key: string;
  schema_version: number;
  value: string;
}

interface BeadsListDependency {
  depends_on_id: string;
  type?: string;
}

interface BeadsShowDependency {
  id: string;
  title?: string;
  status?: string;
  dependency_type?: string;
}

interface BeadsIssue {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority?: number;
  issue_type?: string;
  assignee?: string;
  owner?: string;
  labels?: string[];
  due_at?: string;
  due?: string;
  acceptance_criteria?: string;
  design?: string;
  notes?: string;
  dependencies?: Array<BeadsListDependency | BeadsShowDependency>;
  created_at?: string;
  updated_at?: string;
  dependency_count?: number;
  dependent_count?: number;
  comment_count?: number;
}

interface BeadsBlockedIssue {
  id: string;
  blocked_by_count: number;
  blocked_by: Array<string | BeadsShowDependency>;
}

function toPriorityLabel(value: number | undefined): string | undefined {
  if (value === undefined) return undefined;
  const label = `p${value}`;
  return PRIORITIES.includes(label) ? label : undefined;
}

function toPriorityValue(label: string | undefined): number | undefined {
  if (!label) return undefined;
  const match = label.toLowerCase().match(/^p(\d)$/);
  if (!match) return undefined;
  return Number(match[1]);
}

function toRequiredPriorityValue(label: string): number {
  const value = toPriorityValue(label);
  if (value === undefined) {
    throw new Error(`Unsupported priority for beads backend: ${label}`);
  }
  return value;
}

function fromBackendStatus(status: string): TaskStatus {
  for (const [internalStatus, backendStatus] of Object.entries(STATUS_MAP)) {
    if (backendStatus === status) return internalStatus as TaskStatus;
  }
  throw new Error(`Unsupported status from beads backend: ${status}`);
}

function toBackendStatus(status: TaskStatus): string {
  const mapped = STATUS_MAP[status];
  if (!mapped) throw new Error(`Unsupported status for beads backend: ${status}`);
  return mapped;
}

function toDependency(dependency: BeadsListDependency | BeadsShowDependency): TaskDependency {
  if ("depends_on_id" in dependency) {
    return { ref: dependency.depends_on_id, dependencyType: dependency.type };
  }
  return {
    ref: dependency.id,
    title: dependency.title,
    status: dependency.status,
    dependencyType: dependency.dependency_type,
  };
}

function toBlockedDependency(dependency: string | BeadsShowDependency): TaskDependency {
  return typeof dependency === "string" ? { ref: dependency } : toDependency(dependency);
}

function toTask(beadsIssue: BeadsIssue): Task {
  const task: Task = {
    ref: beadsIssue.id,
    id: beadsIssue.id,
    title: beadsIssue.title,
    description: beadsIssue.description ?? "",
    status: fromBackendStatus(beadsIssue.status),
    owner: beadsIssue.owner,
    priority: toPriorityLabel(beadsIssue.priority),
  };

  if (beadsIssue.issue_type !== undefined) task.taskType = beadsIssue.issue_type;
  if (beadsIssue.assignee !== undefined) task.assignee = beadsIssue.assignee;
  if (beadsIssue.labels?.length) task.labels = beadsIssue.labels;
  if (beadsIssue.acceptance_criteria !== undefined)
    task.acceptanceCriteria = beadsIssue.acceptance_criteria;
  if (beadsIssue.design !== undefined) task.design = beadsIssue.design;
  if (beadsIssue.notes !== undefined) task.notes = beadsIssue.notes;
  if (beadsIssue.dependencies?.length)
    task.dependencies = beadsIssue.dependencies.map(toDependency);
  if (beadsIssue.created_at !== undefined) task.createdAt = beadsIssue.created_at;
  if (beadsIssue.due_at !== undefined) task.dueAt = beadsIssue.due_at;
  if (beadsIssue.due !== undefined) task.dueAt = beadsIssue.due;
  if (beadsIssue.updated_at !== undefined) task.updatedAt = beadsIssue.updated_at;
  if (beadsIssue.dependency_count !== undefined) task.dependencyCount = beadsIssue.dependency_count;
  if (beadsIssue.dependent_count !== undefined) task.dependentCount = beadsIssue.dependent_count;
  if (beadsIssue.comment_count !== undefined) task.commentCount = beadsIssue.comment_count;

  return task;
}

function taskStatusSortRank(status: Task["status"]): number {
  if (status === "inProgress") return 0;
  if (status === "open") return 1;
  if (status === "blocked") return 2;
  return 3;
}

function taskPrioritySortRank(priority: string | undefined): number {
  if (!priority) return PRIORITIES.length + 1;
  const index = PRIORITIES.indexOf(priority);
  return index >= 0 ? index : PRIORITIES.length;
}

function sortActiveTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((left, right) => {
    const statusOrder = taskStatusSortRank(left.status) - taskStatusSortRank(right.status);
    if (statusOrder !== 0) return statusOrder;

    const priorityOrder =
      taskPrioritySortRank(left.priority) - taskPrioritySortRank(right.priority);
    if (priorityOrder !== 0) return priorityOrder;

    return left.ref.localeCompare(right.ref);
  });
}

function fromTaskUpdateToBeadsArgs(update: TaskUpdate): string[] {
  const args: string[] = [];

  if (update.title !== undefined) {
    args.push("--title", update.title.trim());
  }

  if (update.description !== undefined) {
    args.push("--description", update.description);
  }

  if (update.status !== undefined) {
    args.push("--status", toBackendStatus(update.status));
  }

  if (update.priority !== undefined) {
    args.push("--priority", String(toRequiredPriorityValue(update.priority)));
  }

  if (update.taskType !== undefined) {
    args.push("--type", update.taskType || BUILT_IN_TASK_TYPES[0]);
  }

  if (update.dueAt !== undefined) {
    args.push("--due", update.dueAt);
  }

  return args;
}

function parseJsonArray<T>(stdout: string, context: string): T[] {
  try {
    const parsed = JSON.parse(stdout);
    if (!Array.isArray(parsed)) throw new Error("expected JSON array");
    return parsed as T[];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to parse bd output (${context}): ${msg}`);
  }
}

function parseJsonObject<T>(stdout: string, context: string): T {
  try {
    const parsed = JSON.parse(stdout);
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error("expected JSON object");
    }
    return parsed as T;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to parse bd output (${context}): ${msg}`);
  }
}

interface BeadsCapabilityDependencies {
  workspaceExists(path: string): boolean;
  checkCli(): {
    error?: Error;
    status: number | null;
    stdout?: string;
    stderr?: string;
  };
}

const DEFAULT_CAPABILITY_DEPENDENCIES: BeadsCapabilityDependencies = {
  workspaceExists: existsSync,
  checkCli: () => {
    const result = spawnSync("bd", ["--version"], { encoding: "utf8" });
    return {
      error: result.error,
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  },
};

export function checkBeadsCapability(
  cwd: string,
  dependencies: BeadsCapabilityDependencies = DEFAULT_CAPABILITY_DEPENDENCIES
): TaskAdapterCapability {
  if (!dependencies.workspaceExists(resolve(cwd, ".beads"))) {
    return {
      kind: "missing-workspace",
      message: `No Beads workspace found in ${cwd}. Run bd init there first.`,
    };
  }

  const result = dependencies.checkCli();
  if (result.error || result.status !== 0) {
    const details = (result.stderr || result.stdout || result.error?.message || "").trim();
    const suffix = details ? ` (${details})` : "";
    return {
      kind: "unavailable-cli",
      message: `The bd CLI is unavailable. Install bd or add it to PATH.${suffix}`,
    };
  }

  return { kind: "ready" };
}

function isApplicable(cwd = process.cwd()): boolean {
  return checkBeadsCapability(cwd).kind === "ready";
}

function initialize(pi: ExtensionAPI): TaskAdapter {
  let commandQueue: Promise<void> = Promise.resolve();
  const taskTypes = [...BUILT_IN_TASK_TYPES];

  function execBd(args: string[], timeout = 30_000): Promise<string> {
    const command = commandQueue.then(async () => {
      const result = await pi.exec("bd", args, { timeout });
      if (result.code !== 0) {
        const details = (result.stderr || result.stdout || "").trim();
        throw new Error(
          details.length > 0 ? details : `bd ${args.join(" ")} failed (code ${result.code})`
        );
      }
      return result.stdout;
    });

    commandQueue = command.then(
      () => undefined,
      () => undefined
    );
    return command;
  }

  async function claim(ref: string): Promise<void> {
    const out = await execBd(["update", ref, "--claim", "--json"]);
    parseJsonArray<BeadsIssue>(out, `claim ${ref}`);
  }

  async function update(ref: string, update: TaskUpdate): Promise<void> {
    const args = fromTaskUpdateToBeadsArgs(update);
    if (args.length === 0) return;

    const out = await execBd(["update", ref, ...args, "--json"]);
    parseJsonArray<BeadsIssue>(out, `update ${ref}`);
  }

  async function hydrateTaskTypes(): Promise<void> {
    const out = await execBd(["config", "get", "types.custom", "--json"]);
    const config = parseJsonObject<BeadsConfigValue>(out, "config types.custom");
    const customTypes = config.value
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    taskTypes.splice(0, taskTypes.length, ...new Set([...BUILT_IN_TASK_TYPES, ...customTypes]));
  }

  async function show(ref: string): Promise<Task> {
    const out = await execBd(["show", ref, "--json"]);
    const beadsIssues = parseJsonArray<BeadsIssue>(out, `show ${ref}`);
    const task = beadsIssues[0];
    if (!task) throw new Error(`Task not found: ${ref}`);
    return toTask(task);
  }

  return {
    id: "beads",
    statusMap: STATUS_MAP,
    taskTypes,
    priorities: PRIORITIES,
    priorityHotkeys: PRIORITY_HOTKEYS,

    async list(): Promise<Task[]> {
      await hydrateTaskTypes();
      const out = await execBd(makeListArgs());
      const issues = parseJsonArray<BeadsIssue>(out, "list active");
      const blockedOut = await execBd(["blocked", "--json"]);
      const blockedIssues = parseJsonArray<BeadsBlockedIssue>(blockedOut, "blocked active");
      const blockersById = new Map(
        blockedIssues.map((issue) => [issue.id, issue.blocked_by.map(toBlockedDependency)])
      );

      const activeTasks = issues.map(toTask).filter((task) =>
        ACTIVE_TASK_STATUSES.includes(task.status)
      );
      for (const task of activeTasks) {
        const blockedBy = blockersById.get(task.id ?? task.ref);
        if (blockedBy?.length) task.blockedBy = blockedBy;
      }
      return sortActiveTasks(activeTasks).slice(0, MAX_LIST_RESULTS);
    },

    claim,

    show,

    update,

    async create(input: CreateTaskInput): Promise<Task> {
      const title = input.title.trim();
      const status = input.status ?? "open";
      const selectedPriority = input.priority ?? PRIORITIES[Math.floor(PRIORITIES.length / 2)];
      const createArgs = [
        "create",
        "--title",
        title,
        "--priority",
        String(toRequiredPriorityValue(selectedPriority)),
        "--type",
        input.taskType || taskTypes[0],
        "--json",
      ];

      if (input.description && input.description.length > 0) {
        createArgs.splice(3, 0, "--description", input.description);
      }

      if (input.dueAt && input.dueAt.length > 0) {
        createArgs.splice(3, 0, "--due", input.dueAt);
      }

      const out = await execBd(createArgs);
      const createdSnapshot = toTask(parseJsonObject<BeadsIssue>(out, "create"));
      const created = { ...createdSnapshot };

      created.title = title;
      created.description = input.description ?? "";

      if (input.priority !== undefined) {
        created.priority = input.priority;
      }

      if (input.taskType !== undefined) {
        created.taskType = input.taskType;
      }

      if (input.dueAt !== undefined) {
        created.dueAt = input.dueAt;
      }

      if (status !== created.status) {
        try {
          await update(created.ref, { status });
          created.status = status;
        } catch (error) {
          let persistedTask = createdSnapshot;
          try {
            persistedTask = await show(created.ref);
          } catch {
            // The successful create response is the best known persisted state.
          }
          throw new PartialTaskCreateError(persistedTask, status, error);
        }
      }

      return created;
    },
  };
}

export default {
  id: "beads",
  checkCapability: checkBeadsCapability,
  isApplicable,
  initialize,
} satisfies TaskAdapterInitializer;
