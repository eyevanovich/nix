import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Task, TaskStatus } from "../models/task.ts";

export type TaskStatusMap = {
  open: string;
  closed: string;
  inProgress?: string;
} & Partial<Record<Exclude<TaskStatus, "open" | "inProgress" | "closed">, string>>;

export interface TaskUpdate {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: string;
  taskType?: string;
  dueAt?: string;
}

export interface CreateTaskInput extends TaskUpdate {
  title: string;
}

export class PartialTaskCreateError extends Error {
  readonly createdTask: Task;
  readonly requestedStatus?: TaskStatus;
  readonly stage: "status" | "refresh";

  constructor(
    createdTask: Task,
    requestedStatus: TaskStatus | undefined,
    cause: unknown,
    stage: "status" | "refresh" = "status"
  ) {
    const details = cause instanceof Error ? cause.message : String(cause);
    const message = stage === "refresh"
      ? `Task ${createdTask.ref} was created, but refreshing it failed: ${details}`
      : `Task ${createdTask.ref} was created with status ${createdTask.status}, but setting status to ${requestedStatus} failed: ${details}`;
    super(message, { cause });
    this.name = "PartialTaskCreateError";
    this.createdTask = createdTask;
    this.requestedStatus = requestedStatus;
    this.stage = stage;
  }
}

export interface TaskAdapter {
  readonly id: string;
  readonly statusMap: TaskStatusMap;
  readonly taskTypes: string[];
  readonly priorities: string[];
  readonly priorityHotkeys?: Record<string, string>;
  invalidateCache?(): void;
  list(): Promise<Task[]>;
  claim(ref: string): Promise<void>;
  show(ref: string): Promise<Task>;
  update(ref: string, update: TaskUpdate): Promise<void>;
  create(input: CreateTaskInput): Promise<Task>;
}

export type TaskAdapterCapability =
  | { kind: "ready" }
  | { kind: "missing-workspace"; message: string }
  | { kind: "unavailable-cli"; message: string };

export interface TaskAdapterInitializer {
  readonly id: string;
  checkCapability(cwd: string): TaskAdapterCapability;
  isApplicable(cwd?: string): boolean;
  initialize(pi: ExtensionAPI): TaskAdapter;
}

export interface RepositoryIdentity {
  root: string;
  canonicalId: string;
}

export type TrackerDetection =
  | { kind: "ready"; repository: RepositoryIdentity }
  | { kind: "not-applicable"; message: string }
  | { kind: "unavailable"; message: string };

export interface ExecutionRequest {
  prompt: string;
}

export interface TrackerActions {
  create?: (input: CreateTaskInput) => Promise<Task>;
  update?: (ref: string, update: TaskUpdate) => Promise<void>;
  changeStatus?: (ref: string, status: TaskStatus) => Promise<void>;
  changePriority?: (ref: string, priority: string) => Promise<void>;
  changeTaskType?: (ref: string, taskType: string) => Promise<void>;
  startWork(item: Task): Promise<ExecutionRequest>;
}

export interface TrackerBackend {
  readonly id: string;
  readonly label: string;
  readonly statusMap: TaskStatusMap;
  readonly taskTypes: string[];
  readonly priorities: string[];
  readonly priorityHotkeys?: Record<string, string>;
  readonly actions: TrackerActions;
  invalidateCache?(): void;
  list(): Promise<Task[]>;
  show(ref: string): Promise<Task>;
}

export interface TrackerProvider {
  readonly id: string;
  readonly label: string;
  readonly promptPaths: string[];
  detect(cwd: string): Promise<TrackerDetection>;
  connect(cwd: string): Promise<TrackerBackend>;
}
