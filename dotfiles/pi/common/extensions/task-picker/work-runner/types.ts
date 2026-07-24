import type { Task } from "../models/task.ts";
import type { ExecutionRequest } from "../backend/api.ts";

export type TaskRunPhase =
  | "allocating"
  | "allocated"
  | "launching"
  | "launched"
  | "implementing"
  | "validating"
  | "awaiting-decision"
  | "ready-for-review"
  | "failed";

export interface WorkRunnerRequest {
  providerId: string;
  task: Task;
  execution: ExecutionRequest;
  cwd: string;
}

export interface TaskRunRecord {
  version: 1;
  id: string;
  providerId: string;
  taskRef: string;
  primaryRoot: string;
  prompt: string;
  branch: string;
  phase: TaskRunPhase;
  createdAt: string;
  updatedAt: string;
  leaseAttempted: boolean;
  leasePath?: string;
  error?: string;
  zellijTabName?: string;
  summary?: string;
  prUrl?: string;
  zellij?: {
    tabId: number;
    workerPaneId?: string;
    statusPaneId?: string;
  };
}

export type WorkRunnerResult =
  | { kind: "fallback" }
  | { kind: "launched"; record: TaskRunRecord; recordPath: string };

export interface WorkRunner {
  start(request: WorkRunnerRequest): Promise<WorkRunnerResult>;
}

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type CommandExecutor = (
  command: string,
  args: string[],
  options?: { cwd?: string; timeout?: number }
) => Promise<CommandResult>;
