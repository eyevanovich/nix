import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
  buildListPrimaryHelpText,
  resolveListIntent,
  TaskMutationCoordinator,
  type ListControllerState,
} from "../controllers/list.ts";
import {
  FormSaveCoordinator,
  getHeaderStatus,
  isSameDraft,
  normalizeDraft,
  type FormDraft,
} from "../controllers/show.ts";
import { PartialTaskCreateError } from "../backend/api.ts";
import { createTaskSaveSession } from "../extension.ts";
import { buildTaskWorkPrompt, serializeTask } from "../lib/task-serialization.ts";
import {
  buildListRowModel,
  decodeDescription,
  stripAnsi,
} from "../models/list-item.ts";
import {
  buildTaskListTextParts,
  formatTaskStatusSymbol,
  type Task,
} from "../models/task.ts";
import { showTaskList } from "../ui/pages/list.ts";
import { showTaskForm } from "../ui/pages/show.ts";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

interface TestComponent {
  handleInput(data: string): void;
  dispose?(): void;
}

function makeCustomUiHarness() {
  let component: TestComponent | undefined;
  const doneValues: unknown[] = [];
  const notifications: Array<{ message: string; level: string }> = [];
  const tui = { requestRender() {} };
  const theme = {
    fg: (_color: string, text: string) => text,
    bold: (text: string) => text,
  };

  const ui = {
    notify(message: string, level: string) {
      notifications.push({ message, level });
    },
    custom<T>(factory: (tui: unknown, theme: unknown, kb: unknown, done: (value: T) => void) => TestComponent) {
      return new Promise<T>((resolve) => {
        component = factory(tui, theme, {}, (value) => {
          doneValues.push(value);
          component?.dispose?.();
          resolve(value);
        });
      });
    },
  };

  return {
    ctx: { ui } as unknown as ExtensionCommandContext,
    component: () => {
      assert.ok(component);
      return component;
    },
    doneValues,
    notifications,
  };
}

const listState: ListControllerState = {
  searching: false,
  filtered: false,
  allowSearch: true,
  allowPriority: true,
  closeKey: "q",
  priorities: ["p0", "p1", "p2", "p3", "p4"],
  priorityHotkeys: { "0": "p0", "1": "p1", "2": "p2", "3": "p3", "4": "p4" },
};

test("list controller resolves navigation, priority, and search intents", () => {
  assert.deepEqual(resolveListIntent("w", listState), { type: "moveSelection", delta: -1 });
  assert.deepEqual(resolveListIntent("0", listState), { type: "setPriority", priority: "p0" });
  assert.deepEqual(resolveListIntent("f", listState), { type: "searchStart" });
  assert.deepEqual(resolveListIntent("x", { ...listState, searching: true }), {
    type: "searchAppend",
    value: "x",
  });
  assert.deepEqual(resolveListIntent("?", { ...listState, allowSearch: false }), {
    type: "delegate",
  });
});

test("list controller help reflects enabled capabilities and filter state", () => {
  const fullHelp = buildListPrimaryHelpText({ ...listState, filtered: true });
  assert.match(fullHelp, /0\/1\/2\/3\/4 priority/);
  assert.match(fullHelp, /f find/);
  assert.match(fullHelp, /esc clear filter/);

  const limitedHelp = buildListPrimaryHelpText({
    ...listState,
    allowPriority: false,
    allowSearch: false,
  });
  assert.doesNotMatch(limitedHelp, /priority|find/);
});

test("list mutations settle before display changes and refuse overlap", async () => {
  const coordinator = new TaskMutationCoordinator();
  const firstWrite = deferred<void>();
  let displayedStatus = "open";
  let failure: unknown;

  const pending = coordinator.run(
    "demo-1",
    () => firstWrite.promise,
    () => {
      displayedStatus = "closed";
    },
    (error) => {
      failure = error;
    }
  );

  assert.equal(coordinator.isInFlight("demo-1"), true);
  assert.equal(displayedStatus, "open");

  const repeated = await coordinator.run(
    "demo-1",
    async () => {
      throw new Error("must not run");
    },
    () => {},
    () => {}
  );
  assert.deepEqual(repeated, { kind: "busy" });

  firstWrite.resolve();
  assert.deepEqual(await pending, { kind: "succeeded" });
  assert.equal(displayedStatus, "closed");
  assert.equal(failure, undefined);
  assert.equal(coordinator.isInFlight("demo-1"), false);

  const backendError = new Error("database unavailable");
  const failed = await coordinator.run(
    "demo-1",
    async () => {
      throw backendError;
    },
    () => {
      displayedStatus = "blocked";
    },
    (error) => {
      failure = error;
    }
  );
  assert.deepEqual(failed, { kind: "failed", error: backendError });
  assert.equal(displayedStatus, "closed");
  assert.equal(failure, backendError);
});

test("form saves refuse overlap and leaving until the active save settles", async () => {
  const coordinator = new FormSaveCoordinator();
  const write = deferred<boolean>();
  let saveCalls = 0;

  const pending = coordinator.run(() => {
    saveCalls += 1;
    return write.promise;
  });

  assert.equal(coordinator.isSaving, true);
  assert.deepEqual(await coordinator.run(async () => true), { kind: "ignored" });
  assert.equal(saveCalls, 1);

  write.resolve(true);
  assert.deepEqual(await pending, { kind: "succeeded", value: true });
  assert.equal(coordinator.isSaving, false);

  const backendError = new Error("save failed");
  assert.deepEqual(
    await coordinator.run(async () => {
      throw backendError;
    }),
    { kind: "failed", error: backendError }
  );
  assert.equal(coordinator.canStart, true);
});

test("task list wires guarded pessimistic mutations through the page", async () => {
  const harness = makeCustomUiHarness();
  const task: Task = {
    ref: "demo-1",
    id: "demo-1",
    title: "Mutation target",
    description: "",
    status: "open",
    priority: "p2",
    taskType: "task",
  };
  const writes = [deferred<void>(), deferred<void>()];
  const updates: unknown[] = [];

  const page = showTaskList(harness.ctx, {
    title: "Tasks",
    tasks: [task],
    priorities: ["p0", "p1", "p2", "p3", "p4"],
    closeKey: "x",
    cycleStatus: (status) => (status === "open" ? "closed" : "blocked"),
    cycleTaskType: () => "bug",
    onUpdateTask: (_ref, update) => {
      updates.push(update);
      const write = writes[updates.length - 1];
      assert.ok(write);
      return write.promise;
    },
    onWork: () => {},
    onInsert: () => {},
    onEdit: async () => ({ updatedTask: null, closeList: false }),
    onCreate: async () => null,
  });

  harness.component().handleInput(" ");
  harness.component().handleInput(" ");
  assert.equal(updates.length, 1);
  assert.equal(task.status, "open");
  assert.match(harness.notifications[0]?.message ?? "", /still saving/);

  writes[0]?.resolve();
  await flushMicrotasks();
  assert.equal(task.status, "closed");

  harness.component().handleInput(" ");
  assert.equal(updates.length, 2);
  assert.equal(task.status, "closed");
  writes[1]?.reject(new Error("write failed"));
  await flushMicrotasks();
  assert.equal(task.status, "closed");
  assert.ok(
    harness.notifications.some(
      ({ message, level }) => level === "error" && message === "write failed"
    )
  );

  harness.component().handleInput("x");
  await page;
});

test("task form blocks exit during save and keeps failures retryable", async () => {
  const harness = makeCustomUiHarness();
  const firstSave = deferred<boolean>();
  const drafts: FormDraft[] = [];

  const form = showTaskForm(harness.ctx, {
    mode: "edit",
    subtitle: "Edit",
    task: {
      ref: "demo-1",
      id: "demo-1",
      title: "Task",
      description: "",
      status: "open",
      priority: "p2",
      taskType: "task",
    },
    closeKey: "x",
    cycleStatus: (status) => (status === "open" ? "closed" : "open"),
    cycleTaskType: () => "bug",
    parsePriorityKey: () => null,
    priorities: ["p0", "p1", "p2", "p3", "p4"],
    onSave: (draft) => {
      drafts.push(draft);
      return drafts.length === 1 ? firstSave.promise : Promise.resolve(true);
    },
  });

  harness.component().handleInput(" ");
  harness.component().handleInput("\r");
  harness.component().handleInput("q");
  harness.component().handleInput("x");
  assert.equal(harness.doneValues.length, 0);
  assert.equal(drafts.length, 1);
  assert.ok(
    harness.notifications.some(
      ({ message, level }) => level === "warning" && message.includes("Save in progress")
    )
  );

  firstSave.reject(new Error("save failed"));
  await flushMicrotasks();
  assert.ok(
    harness.notifications.some(
      ({ message, level }) => level === "error" && message === "save failed"
    )
  );

  harness.component().handleInput("\r");
  await flushMicrotasks();
  assert.equal(drafts.length, 2);
  harness.component().handleInput("q");
  assert.deepEqual(await form, { action: "back" });
});

test("partial create recovery retries the created task as an update", async () => {
  const createdTask: Task = {
    ref: "demo-partial",
    id: "demo-partial",
    title: "Partial",
    description: "Details",
    status: "open",
    priority: "p1",
    taskType: "bug",
  };
  const createError = new PartialTaskCreateError(
    createdTask,
    "blocked",
    new Error("status failed")
  );
  let createCalls = 0;
  const updates: Array<{ ref: string; update: unknown }> = [];
  const session = createTaskSaveSession({
    async create() {
      createCalls += 1;
      throw createError;
    },
    async update(ref, update) {
      updates.push({ ref, update });
    },
  });
  const draft: FormDraft = {
    title: "Partial",
    description: "Details",
    status: "blocked",
    priority: "p1",
    taskType: "bug",
  };

  await assert.rejects(session.save(draft), (error) => error === createError);
  assert.equal(session.createdTask?.ref, "demo-partial");
  assert.equal(await session.save(draft), true);
  assert.equal(createCalls, 1);
  assert.deepEqual(updates, [
    { ref: "demo-partial", update: { status: "blocked" } },
  ]);
  assert.equal(session.createdTask?.status, "blocked");
});

test("show controller normalizes drafts and reports save state", () => {
  const draft: FormDraft = {
    title: "  A title  ",
    description: "Details",
    status: "open",
    priority: "p2",
    taskType: "task",
  };

  assert.deepEqual(normalizeDraft(draft), { ...draft, title: "A title" });
  assert.equal(isSameDraft(draft, { ...draft, title: "A title" }), true);
  assert.equal(isSameDraft(draft, { ...draft, description: "Changed" }), false);
  assert.deepEqual(getHeaderStatus("saving", "desc"), {
    message: "Saving…",
    icon: "⟳",
    color: "dim",
  });
  assert.deepEqual(getHeaderStatus(undefined, "title"), {
    message: "Editing title",
    color: "accent",
  });
});

test("task models build stable list text and encoded rows", () => {
  const task: Task = {
    ref: "junk-8dn.1",
    id: "junk-8dn.1",
    title: "Portable harness",
    description: "First line\nSecond line",
    status: "inProgress",
    priority: "p1",
    taskType: "feature",
  };

  const parts = buildTaskListTextParts(task);
  assert.equal(stripAnsi(parts.identity), "P1 8dn.1");
  assert.equal(parts.title, "Portable harness");
  assert.equal(parts.meta, "◑ feat");
  assert.equal(parts.summary, "First line");
  assert.equal(formatTaskStatusSymbol("blocked"), "✖");

  const row = buildListRowModel(task, { maxLabelWidth: 40 });
  assert.equal(row.ref, task.ref);
  assert.equal(stripAnsi(row.label).length, 40);
  assert.deepEqual(decodeDescription(row.description), {
    meta: "◑ feat",
    summary: "First line",
  });
});

test("task serialization preserves metadata and escapes multiline descriptions", () => {
  const task: Task = {
    ref: "junk-8dn.1",
    id: "junk-8dn.1",
    title: "Portable harness",
    description: "Line one\nLine two",
    status: "inProgress",
    priority: "p1",
    taskType: "task",
    dueAt: "2026-08-01",
  };

  assert.equal(
    serializeTask(task),
    'task(id=junk-8dn.1, title="Portable harness", status=in-progress, priority=p1, type=task, description="Line one\\nLine two", due="2026-08-01")'
  );
  assert.equal(
    buildTaskWorkPrompt(task),
    "Work on task junk-8dn.1: Portable harness\n\nStatus: in-progress\nPriority: p1\n\nContext:\nLine one\nLine two"
  );
});
