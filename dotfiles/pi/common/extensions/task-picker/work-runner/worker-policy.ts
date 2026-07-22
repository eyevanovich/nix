import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type TSchema } from "typebox";
import { randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isolatedWorkerInstructions, WORKER_PHASES } from "./worker-instructions.ts";
import type { TaskRunPhase, TaskRunRecord } from "./types.ts";

const PROMPTS_DIR = fileURLToPath(new URL("../prompts", import.meta.url));
const RUN_ID_PATTERN = /^[a-f0-9]{12}$/;

export interface ValidatedRunRecordPath {
  path: string;
  id: string;
  runsDir: string;
}

export function validateRunRecordPath(
  recordPath: string | undefined,
  env: NodeJS.ProcessEnv
): ValidatedRunRecordPath | null {
  if (!recordPath || !isAbsolute(recordPath)) return null;
  const configDir = env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
  const runsDir = resolve(configDir, "task-picker-runs");
  const path = resolve(recordPath);
  if (dirname(path) !== runsDir) return null;
  const match = basename(path).match(/^([a-f0-9]{12})\.json$/);
  if (!match || !RUN_ID_PATTERN.test(match[1]!)) return null;
  return { path, id: match[1]!, runsDir };
}

export async function readRunRecord(path: string, expectedId: string): Promise<TaskRunRecord> {
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  if (
    typeof parsed !== "object" || parsed === null ||
    (parsed as TaskRunRecord).version !== 1 ||
    (parsed as TaskRunRecord).id !== expectedId
  ) {
    throw new Error("Invalid task-picker run record");
  }
  return parsed as TaskRunRecord;
}

async function updateRecord(
  path: string,
  expectedId: string,
  phase: TaskRunPhase,
  summary?: string,
  prUrl?: string
): Promise<TaskRunRecord> {
  const record = await readRunRecord(path, expectedId);
  const next: TaskRunRecord = {
    ...record,
    phase,
    updatedAt: new Date().toISOString(),
  };
  if (summary !== undefined) next.summary = summary;
  if (prUrl !== undefined) next.prUrl = prUrl;
  const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temp, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temp, path);
  return next;
}

export default function registerWorkerPolicy(pi: ExtensionAPI): void {
  const validated = validateRunRecordPath(process.env.TASK_PICKER_RUN_FILE, process.env);
  if (!validated || process.env.TASK_PICKER_ISOLATED_RUN !== "1") return;
  const recordPath = validated.path;

  pi.on("resources_discover", () => ({ promptPaths: [PROMPTS_DIR] }));

  pi.on("before_agent_start", () => ({
    message: {
      customType: "task-picker-isolated-policy",
      content: isolatedWorkerInstructions(),
      display: true,
    },
  }));

  pi.registerTool({
    name: "task_run_update",
    label: "Task Run Update",
    description: "Update the durable state of the current isolated task run.",
    promptSnippet: "Record isolated task-run phase, summary, and PR URL",
    promptGuidelines: [
      "Use task_run_update at validation start, decision waits, ready-for-review, and terminal failure during an isolated task-picker run.",
    ],
    parameters: Type.Object({
      phase: Type.Unsafe<(typeof WORKER_PHASES)[number]>({
        type: "string",
        enum: [...WORKER_PHASES],
      } as TSchema),
      summary: Type.Optional(Type.String()),
      prUrl: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params) {
      const record = await updateRecord(
        recordPath,
        validated.id,
        params.phase,
        params.summary,
        params.prUrl
      );
      return {
        content: [{ type: "text", text: `Task run ${record.id}: ${record.phase}` }],
        details: { runId: record.id, phase: record.phase, recordPath: dirname(recordPath) },
      };
    },
  });
}
