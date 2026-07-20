import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { fileURLToPath } from "node:url";
import {
  openExplicitTaskBrowser,
  openResolvedTaskBrowser,
} from "./backend/resolver.ts";
import { createBeadsProvider } from "./backend/providers/beads.ts";
import { createGitLabProvider } from "./backend/providers/gitlab.ts";
import type { Task, TaskStatus } from "./models/task.ts";
import { serializeTask } from "./lib/task-serialization.ts";
import { showTaskList } from "./ui/pages/list.ts";
import { showTaskForm } from "./ui/pages/show.ts";
import { PartialTaskCreateError } from "./backend/api.ts";
import type { TaskAdapter, TaskUpdate, TrackerBackend, TrackerProvider } from "./backend/api.ts";
import type { FormDraft } from "./controllers/show.ts";

const CTRL_X = "\x18";
const PROMPTS_DIR = fileURLToPath(new URL("./prompts", import.meta.url));

function parsePriorityKey(
  data: string,
  priorities: string[],
  priorityHotkeys?: Record<string, string>
): string | null {
  if (data.length !== 1) return null;

  const hotkeyPriority = priorityHotkeys?.[data];
  if (hotkeyPriority && priorities.includes(hotkeyPriority)) return hotkeyPriority;

  const rank = parseInt(data, 10);
  if (isNaN(rank) || rank < 1 || rank > priorities.length) return null;
  return priorities[rank - 1] ?? null;
}

function cycleStatus(current: TaskStatus, statusMap: Record<string, string>): TaskStatus {
  const statusCycle = Object.keys(statusMap) as TaskStatus[];
  if (statusCycle.length === 0) return "open";
  const idx = statusCycle.indexOf(current);
  if (idx === -1) return statusCycle[0];
  return statusCycle[(idx + 1) % statusCycle.length];
}

function cycleTaskType(current: string | undefined, taskTypes: string[]): string {
  if (taskTypes.length === 0) return "task";
  const normalized = current || taskTypes[0];
  const idx = taskTypes.indexOf(normalized);
  if (idx === -1) return taskTypes[0];
  return taskTypes[(idx + 1) % taskTypes.length];
}

function defaultPriority(priorities: string[]): string | undefined {
  if (priorities.length === 0) return undefined;
  return priorities[Math.floor(priorities.length / 2)];
}

function defaultTaskType(taskTypes: string[]): string | undefined {
  return taskTypes[0];
}

function hasUniqueValues(values: string[]): boolean {
  return new Set(values).size === values.length;
}

function validateBackendConfiguration(backend: TrackerBackend): void {
  const statusKeys = Object.keys(backend.statusMap);
  if (statusKeys.length === 0) {
    throw new Error(`Invalid backend config (${backend.id}): statusMap must not be empty`);
  }

  if (!statusKeys.includes("open") || !statusKeys.includes("closed")) {
    throw new Error(
      `Invalid backend config (${backend.id}): statusMap must include open and closed`
    );
  }

  if (!hasUniqueValues(backend.taskTypes)) {
    throw new Error(`Invalid backend config (${backend.id}): taskTypes must be unique`);
  }

  if (
    backend.priorities.length !== 0 &&
    (backend.priorities.length < 3 || backend.priorities.length > 5)
  ) {
    throw new Error(
      `Invalid backend config (${backend.id}): priorities must be empty or contain 3 to 5 values`
    );
  }

  if (!hasUniqueValues(backend.priorities)) {
    throw new Error(`Invalid backend config (${backend.id}): priorities must be unique`);
  }

  if (backend.priorityHotkeys) {
    for (const [key, priority] of Object.entries(backend.priorityHotkeys)) {
      if (key.length !== 1) {
        throw new Error(
          `Invalid backend config (${backend.id}): priority hotkey keys must be a single character`
        );
      }

      if (!backend.priorities.includes(priority)) {
        throw new Error(
          `Invalid backend config (${backend.id}): priority hotkey ${key} points to unsupported priority ${priority}`
        );
      }
    }
  }
}

interface EditTaskResult {
  updatedTask: Task | null;
  closeList: boolean;
}

export function mergeHydratedTask(fromList: Task | undefined, shown: Task): Task {
  if (!fromList?.blockedBy?.length) return shown;

  const dependencies = new Map(shown.dependencies?.map((dependency) => [dependency.ref, dependency]));
  return {
    ...shown,
    blockedBy: fromList.blockedBy.map((blocker) => ({
      ...blocker,
      ...dependencies.get(blocker.ref),
    })),
  };
}

export async function hydrateTaskForEdit(
  backend: Pick<TaskAdapter, "show">,
  ref: string,
  fromList?: Task
): Promise<Task> {
  return mergeHydratedTask(fromList, await backend.show(ref));
}

export function createTaskWorkHandler(
  send: (prompt: string) => void
): (task: Task) => Promise<void> {
  return async (task) => {
    send(`/execute-beads ${task.id ?? task.ref}`);
  };
}

function buildTaskUpdate(
  previous: Task,
  next: {
    title: string;
    description: string;
    status: TaskStatus;
    priority: string | undefined;
    taskType: string | undefined;
  }
): TaskUpdate {
  const update: TaskUpdate = {};

  const nextTitle = next.title.trim();
  if (nextTitle !== previous.title.trim()) {
    update.title = nextTitle;
  }

  if (next.description !== (previous.description ?? "")) {
    update.description = next.description;
  }

  if (next.status !== previous.status) {
    update.status = next.status;
  }

  if (next.priority !== previous.priority && next.priority !== undefined) {
    update.priority = next.priority;
  }

  if (next.taskType !== previous.taskType) {
    update.taskType = next.taskType || "task";
  }

  return update;
}

function hasTaskUpdate(update: TaskUpdate): boolean {
  return Object.keys(update).length > 0;
}

function applyDraftToTask(
  task: Task,
  draft: {
    title: string;
    description: string;
    status: TaskStatus;
    priority: string | undefined;
    taskType: string | undefined;
  }
): Task {
  const nextTask: Task = {
    ...task,
    title: draft.title.trim(),
    description: draft.description,
    status: draft.status,
  };

  if (draft.priority !== undefined) {
    nextTask.priority = draft.priority;
  } else {
    delete nextTask.priority;
  }

  if (draft.taskType !== undefined) {
    nextTask.taskType = draft.taskType;
  } else {
    delete nextTask.taskType;
  }

  return nextTask;
}

export function createTaskSaveSession(backend: Pick<TaskAdapter, "create" | "update">) {
  let createdTask: Task | null = null;

  return {
    get createdTask(): Task | null {
      return createdTask;
    },

    async save(draft: FormDraft): Promise<boolean> {
      const title = draft.title.trim();
      if (title.length === 0) throw new Error("Title is required");

      if (!createdTask) {
        try {
          createdTask = await backend.create({
            title,
            description: draft.description,
            status: draft.status,
            priority: draft.priority,
            taskType: draft.taskType,
          });
        } catch (error) {
          if (error instanceof PartialTaskCreateError) {
            createdTask = error.createdTask;
          }
          throw error;
        }
        return true;
      }

      const update = buildTaskUpdate(createdTask, draft);
      if (!hasTaskUpdate(update)) return false;

      await backend.update(createdTask.ref, update);
      createdTask = applyDraftToTask(createdTask, draft);
      return true;
    },
  };
}

export interface TaskBrowserDependencies {
  providers?: TrackerProvider[];
}

export default function registerExtension(
  pi: ExtensionAPI,
  dependencies: TaskBrowserDependencies = {}
) {
  const providers = dependencies.providers ?? [
    createBeadsProvider(pi, [PROMPTS_DIR]),
    createGitLabProvider(pi, [PROMPTS_DIR]),
  ];
  const trackerChoices = new Map<string, string>();

  pi.on("resources_discover", () => ({
    promptPaths: [...new Set(providers.flatMap((provider) => provider.promptPaths))],
  }));

  async function browseTasks(
    ctx: ExtensionCommandContext,
    provider: TrackerProvider
  ): Promise<void> {
    const backend = await provider.connect(ctx.cwd);
    validateBackendConfiguration(backend);

    const canEdit = backend.actions.update !== undefined;
    const canCreate = backend.actions.create !== undefined;
    const canChangeStatus = backend.actions.changeStatus !== undefined;
    const canChangePriority = backend.actions.changePriority !== undefined;
    const canChangeTaskType = backend.actions.changeTaskType !== undefined;
    const nextStatus = (status: TaskStatus): TaskStatus => cycleStatus(status, backend.statusMap);
    const nextTaskType = (current: string | undefined): string =>
      cycleTaskType(current, backend.taskTypes);
    const nextPriorityFromKey = (data: string): string | null =>
      parsePriorityKey(data, backend.priorities, backend.priorityHotkeys);

    async function persistInlineUpdate(ref: string, update: TaskUpdate): Promise<void> {
      if (update.status !== undefined && backend.actions.changeStatus) {
        await backend.actions.changeStatus(ref, update.status);
        return;
      }
      if (update.priority !== undefined && backend.actions.changePriority) {
        await backend.actions.changePriority(ref, update.priority);
        return;
      }
      if (update.taskType !== undefined && backend.actions.changeTaskType) {
        await backend.actions.changeTaskType(ref, update.taskType);
        return;
      }
      if (!backend.actions.update) throw new Error(`${backend.label} does not support editing`);
      await backend.actions.update(ref, update);
    }

    async function editTask(
      ref: string,
      fromList?: Task
    ): Promise<EditTaskResult> {
      if (!backend.actions.update) return { updatedTask: null, closeList: false };
      let task = await hydrateTaskForEdit(backend, ref, fromList);

      const formResult = await showTaskForm(ctx, {
        mode: "edit",
        subtitle: "Edit",
        task,
        closeKey: CTRL_X,
        cycleStatus: nextStatus,
        cycleTaskType: nextTaskType,
        parsePriorityKey: nextPriorityFromKey,
        priorities: backend.priorities,
        priorityHotkeys: backend.priorityHotkeys,
        allowStatus: canChangeStatus,
        allowPriority: canChangePriority,
        allowTaskType: canChangeTaskType,
        onSave: async (draft) => {
          const update = buildTaskUpdate(task, draft);
          if (!canChangeStatus) delete update.status;
          if (!canChangePriority) delete update.priority;
          if (!canChangeTaskType) delete update.taskType;
          if (!hasTaskUpdate(update)) return false;

          await backend.actions.update!(ref, update);
          task = applyDraftToTask(task, {
            ...draft,
            status: canChangeStatus ? draft.status : task.status,
            priority: canChangePriority ? draft.priority : task.priority,
            taskType: canChangeTaskType ? draft.taskType : task.taskType,
          });
          return true;
        },
      });

      return { updatedTask: task, closeList: formResult.action === "close_list" };
    }

    async function createTask(): Promise<Task | null> {
      if (!backend.actions.create) return null;
      let createdTask: Task | null = null;
      await showTaskForm(ctx, {
        mode: "create",
        subtitle: "Create",
        task: {
          ref: "new",
          title: "",
          description: "",
          status: "open",
          priority: canChangePriority ? defaultPriority(backend.priorities) : undefined,
          taskType: canChangeTaskType ? defaultTaskType(backend.taskTypes) : undefined,
        },
        closeKey: CTRL_X,
        cycleStatus: nextStatus,
        cycleTaskType: nextTaskType,
        parsePriorityKey: nextPriorityFromKey,
        priorities: backend.priorities,
        priorityHotkeys: backend.priorityHotkeys,
        allowStatus: canChangeStatus,
        allowPriority: canChangePriority,
        allowTaskType: canChangeTaskType,
        onSave: async (draft) => {
          if (draft.title.trim().length === 0) throw new Error("Title is required");

          if (createdTask) {
            if (!backend.actions.update) return false;
            const update = buildTaskUpdate(createdTask, draft);
            if (!canChangeStatus) delete update.status;
            if (!canChangePriority) delete update.priority;
            if (!canChangeTaskType) delete update.taskType;
            if (!hasTaskUpdate(update)) return false;
            await backend.actions.update(createdTask.ref, update);
            createdTask = applyDraftToTask(createdTask, draft);
            return true;
          }

          try {
            createdTask = await backend.actions.create!({
              title: draft.title.trim(),
              description: draft.description,
              status: canChangeStatus ? draft.status : undefined,
              priority: canChangePriority ? draft.priority : undefined,
              taskType: canChangeTaskType ? draft.taskType : undefined,
            });
          } catch (error) {
            if (error instanceof PartialTaskCreateError) createdTask = error.createdTask;
            throw error;
          }
          return true;
        },
      });
      return createdTask;
    }

    try {
      backend.invalidateCache?.();
      ctx.ui.setStatus("tasks", "Loading…");
      const tasks = await backend.list();
      ctx.ui.setStatus("tasks", undefined);

      await showTaskList(ctx, {
        title: "Tasks",
        subtitle: backend.label,
        tasks,
        closeKey: CTRL_X,
        priorities: backend.priorities,
        priorityHotkeys: backend.priorityHotkeys,
        allowPriority: canChangePriority,
        allowStatus: canChangeStatus,
        allowTaskType: canChangeTaskType,
        allowEdit: canEdit,
        allowCreate: canCreate,
        cycleStatus: nextStatus,
        cycleTaskType: nextTaskType,
        onUpdateTask: persistInlineUpdate,
        onWork: async (task) => {
          const request = await backend.actions.startWork(task);
          pi.sendUserMessage(request.prompt);
        },
        onInsert: (task) => ctx.ui.pasteToEditor(`${serializeTask(task)} `),
        onEdit: (ref, task) => editTask(ref, task),
        onCreate: createTask,
      });
    } catch (error) {
      ctx.ui.setStatus("tasks", undefined);
      ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
    }
  }

  const openProvider = (ctx: ExtensionCommandContext, provider: TrackerProvider) =>
    browseTasks(ctx, provider);

  pi.registerCommand("tasks", {
    description: "Open task list",
    handler: async (_rawArgs, ctx) => {
      await openResolvedTaskBrowser(
        ctx,
        providers,
        (provider) => openProvider(ctx, provider),
        trackerChoices
      );
    },
  });

  const beadsProvider = providers.find((provider) => provider.id === "beads");
  if (beadsProvider) {
    pi.registerCommand("beads-tasks", {
      description: "Open Beads task list",
      handler: async (_rawArgs, ctx) => {
        await openExplicitTaskBrowser(ctx, beadsProvider, (provider) => openProvider(ctx, provider));
      },
    });
  }

  const gitlabProvider = providers.find((provider) => provider.id === "gitlab");
  if (gitlabProvider) {
    pi.registerCommand("gitlab-issues", {
      description: "Open GitLab issue list",
      handler: async (_rawArgs, ctx) => {
        await openExplicitTaskBrowser(ctx, gitlabProvider, (provider) => openProvider(ctx, provider));
      },
    });
  }

  pi.registerShortcut("ctrl+e", {
    description: "Open task list",
    handler: async (ctx) => {
      const commandContext = ctx as ExtensionCommandContext;
      await openResolvedTaskBrowser(
        commandContext,
        providers,
        (provider) => openProvider(commandContext, provider),
        trackerChoices
      );
    },
  });
}
