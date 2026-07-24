import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
import { mkdir, realpath, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { preflightIsolatedRun } from "./preflight.ts";
import { acquireTreehouseLease, attestLease, createTaskBranch } from "./treehouse.ts";
import type {
  CommandExecutor,
  TaskRunRecord,
  WorkRunner,
  WorkRunnerRequest,
  WorkRunnerResult,
} from "./types.ts";
import { launchZellijTask } from "./zellij.ts";

export interface WorkRunnerDependencies {
  exec: CommandExecutor;
  env: NodeJS.ProcessEnv;
  stateDir: string;
  now(): Date;
  createId(): string;
  canonicalize(path: string): Promise<string>;
  persistRecord(path: string, record: TaskRunRecord): Promise<void>;
  workerPolicyPath: string;
  statusPanePath: string;
}

async function writeRecord(path: string, record: TaskRunRecord): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temp, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temp, path);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createWorkRunnerWithDependencies(dependencies: WorkRunnerDependencies): WorkRunner {
  return {
    async start(request: WorkRunnerRequest): Promise<WorkRunnerResult> {
      const preflight = await preflightIsolatedRun(dependencies.exec, request.cwd, dependencies.env);
      if (!preflight) return { kind: "fallback" };

      let primaryRoot: string;
      try {
        primaryRoot = await dependencies.canonicalize(preflight.primaryRoot);
      } catch {
        return { kind: "fallback" };
      }

      const id = dependencies.createId();
      const branch = `task-picker/${id}`;
      const timestamp = dependencies.now().toISOString();
      const recordPath = join(dependencies.stateDir, `${id}.json`);
      let record: TaskRunRecord = {
        version: 1,
        id,
        providerId: request.providerId,
        taskRef: request.task.ref,
        primaryRoot,
        prompt: request.execution.prompt,
        branch,
        phase: "allocating",
        createdAt: timestamp,
        updatedAt: timestamp,
        leaseAttempted: false,
      };
      const persist = async (patch: Partial<TaskRunRecord> = {}) => {
        record = {
          ...record,
          ...patch,
          updatedAt: dependencies.now().toISOString(),
        };
        await dependencies.persistRecord(recordPath, record);
      };

      try {
        await persist();
        await persist({ leaseAttempted: true });
      } catch {
        return { kind: "fallback" };
      }

      try {
        const rawLease = await acquireTreehouseLease(
          dependencies.exec,
          primaryRoot,
          `task-picker:${request.providerId}:${id}`
        );
        await persist({ leasePath: rawLease, phase: "allocated" });

        const leasePath = await attestLease(
          dependencies.exec,
          primaryRoot,
          rawLease,
          dependencies.canonicalize
        );
        await persist({ primaryRoot, leasePath });
        await createTaskBranch(dependencies.exec, leasePath, branch);
        const zellijTabName = `task-picker-${id}`;
        await persist({ phase: "launching", zellijTabName });

        const zellij = await launchZellijTask(
          dependencies.exec,
          {
            leasePath,
            tabName: zellijTabName,
            recordPath,
            workerPolicyPath: dependencies.workerPolicyPath,
            statusPanePath: dependencies.statusPanePath,
            prompt: request.execution.prompt,
          },
          async (endpoint) => persist({
            phase: endpoint.statusPaneId ? "launched" : "launching",
            zellij: endpoint,
          })
        );
        return { kind: "launched", record, recordPath };
      } catch (error) {
        const message = errorMessage(error);
        try {
          await persist({ phase: "failed", error: message });
        } catch (persistenceError) {
          throw new Error(
            `${message}. The run may own a Treehouse lease, and recovery metadata also failed to persist: ${errorMessage(persistenceError)}`
          );
        }
        throw new Error(`${message}. Recovery metadata: ${recordPath}`);
      }
    },
  };
}

export function createWorkRunner(pi: ExtensionAPI): WorkRunner {
  const configDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
  return createWorkRunnerWithDependencies({
    exec: async (command, args, options) => {
      const result = await pi.exec(command, args, options);
      return { code: result.code, stdout: result.stdout, stderr: result.stderr };
    },
    env: process.env,
    stateDir: join(configDir, "task-picker-runs"),
    now: () => new Date(),
    createId: () => randomUUID().replaceAll("-", "").slice(0, 12),
    canonicalize: realpath,
    persistRecord: writeRecord,
    workerPolicyPath: fileURLToPath(new URL("./worker-policy.ts", import.meta.url)),
    statusPanePath: fileURLToPath(new URL("./status-pane.mjs", import.meta.url)),
  });
}
