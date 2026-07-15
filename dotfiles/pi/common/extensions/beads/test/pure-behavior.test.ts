import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
  CURSOR_MARKER,
  KeybindingsManager,
  TUI_KEYBINDINGS,
  visibleWidth,
  type KeybindingsConfig,
} from "@earendil-works/pi-tui";
import {
  buildListPrimaryHelpText,
  resolveListIntent,
  TaskMutationCoordinator,
  type ListControllerState,
} from "../controllers/list.ts";
import {
  buildPrimaryHelpText,
  FormSaveCoordinator,
  getHeaderStatus,
  isSameDraft,
  normalizeDraft,
  type FormDraft,
} from "../controllers/show.ts";
import { PartialTaskCreateError } from "../backend/api.ts";
import {
  createTaskSaveSession,
  createTaskWorkHandler,
  hydrateTaskForEdit,
  mergeHydratedTask,
} from "../extension.ts";
import { buildTaskContext } from "../lib/task-context.ts";
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
import { buildReadOnlyTaskContext, showTaskForm } from "../ui/pages/show.ts";
import { SelectListWithColumns } from "../ui/components/select-list-with-columns.ts";

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
  focused?: boolean;
  render(width: number): string[];
  handleInput(data: string): void;
  dispose?(): void;
}

function makeCustomUiHarness(userBindings: KeybindingsConfig = {}) {
  let component: TestComponent | undefined;
  const doneValues: unknown[] = [];
  const notifications: Array<{ message: string; level: string }> = [];
  const tui = { requestRender() {}, terminal: { rows: 24, columns: 80 } };
  const keybindings = new KeybindingsManager(TUI_KEYBINDINGS, userBindings);
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
        component = factory(tui, theme, keybindings, (value) => {
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
    setTerminalRows(rows: number) {
      tui.terminal.rows = rows;
    },
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
  keybindings: new KeybindingsManager(TUI_KEYBINDINGS),
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
  assert.match(fullHelp, /escape\/ctrl\+c clear filter/);

  const limitedHelp = buildListPrimaryHelpText({
    ...listState,
    allowPriority: false,
    allowSearch: false,
  });
  assert.doesNotMatch(limitedHelp, /priority|find/);
});

test("configured standard actions drive list intents and help", () => {
  const keybindings = new KeybindingsManager(TUI_KEYBINDINGS, {
    "tui.select.up": ["ctrl+p"],
    "tui.select.down": ["ctrl+n"],
    "tui.select.confirm": ["ctrl+y"],
    "tui.select.cancel": ["ctrl+g"],
    "tui.editor.cursorRight": ["ctrl+r"],
    "tui.input.tab": ["ctrl+i"],
  });
  const state = { ...listState, keybindings };

  assert.deepEqual(resolveListIntent("\x10", state), { type: "moveSelection", delta: -1 });
  assert.deepEqual(resolveListIntent("\x0e", state), { type: "moveSelection", delta: 1 });
  assert.deepEqual(resolveListIntent("\x19", state), { type: "work" });
  assert.deepEqual(resolveListIntent("\t", state), { type: "insert" });

  const help = buildListPrimaryHelpText({ ...state, closeKey: "\x18" });
  assert.match(help, /w\/ctrl\+p up/);
  assert.match(help, /s\/ctrl\+n down/);
  assert.match(help, /ctrl\+y work/);
  assert.match(help, /e\/ctrl\+r edit/);
  assert.match(help, /ctrl\+i insert/);
  assert.match(help, /ctrl\+g cancel/);
  assert.match(help, /ctrl\+x close/);
});

test("form help reports effective input keys and the actual browser close key", () => {
  const keybindings = new KeybindingsManager(TUI_KEYBINDINGS, {
    "tui.input.submit": ["ctrl+s"],
    "tui.input.tab": ["ctrl+i"],
    "tui.input.newLine": ["alt+enter"],
    "tui.select.cancel": ["ctrl+g"],
    "tui.editor.cursorLeft": ["ctrl+l"],
  });

  assert.equal(
    buildPrimaryHelpText("nav", keybindings, "ctrl+x"),
    "ctrl+i title • ctrl+s save • ctrl+g/ctrl+l/q back • ctrl+x close"
  );
  assert.equal(
    buildPrimaryHelpText("desc", keybindings, "ctrl+x"),
    "alt+enter newline • ctrl+s/ctrl+i save • ctrl+g back"
  );
});

test("reserved close key wins collisions and is filtered from standard-action help", () => {
  const keybindings = new KeybindingsManager(TUI_KEYBINDINGS, {
    "tui.select.confirm": ["ctrl+x"],
    "tui.select.cancel": ["ctrl+x"],
    "tui.editor.cursorRight": ["ctrl+x"],
    "tui.editor.cursorLeft": ["ctrl+x"],
    "tui.input.submit": ["ctrl+x"],
    "tui.input.tab": ["ctrl+x"],
    "tui.input.newLine": ["ctrl+x"],
  });
  const state = { ...listState, closeKey: "\x18", keybindings };

  assert.deepEqual(resolveListIntent("\x18", state), { type: "cancel" });
  const listHelp = buildListPrimaryHelpText(state);
  assert.equal(listHelp.match(/ctrl\+x/g)?.length, 1);
  assert.match(listHelp, /\(unbound\) work/);
  assert.match(listHelp, /\(unbound\) cancel/);
  assert.match(listHelp, /ctrl\+x close/);

  const navHelp = buildPrimaryHelpText("nav", keybindings, "ctrl+x");
  assert.equal(navHelp, "(unbound) title • (unbound) save • q back • ctrl+x close");
  assert.equal(buildPrimaryHelpText("title", keybindings, "ctrl+x"), "(unbound) save • (unbound) description • (unbound) back");
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

test("task list honors configured ctrl+p/ctrl+n navigation and confirm", async () => {
  const harness = makeCustomUiHarness({
    "tui.select.up": ["ctrl+p"],
    "tui.select.down": ["ctrl+n"],
    "tui.select.confirm": ["ctrl+y"],
  });
  const tasks: Task[] = [
    { ref: "first", title: "First", status: "open" },
    { ref: "second", title: "Second", status: "open" },
  ];
  const worked: Task[] = [];
  const page = showTaskList(harness.ctx, {
    title: "Tasks",
    tasks,
    priorities: ["p0", "p1", "p2"],
    closeKey: "\x18",
    cycleStatus: (status) => status,
    cycleTaskType: () => "task",
    onUpdateTask: async () => {},
    onWork: async (task) => { worked.push(task); },
    onInsert: () => {},
    onEdit: async () => ({ updatedTask: null, closeList: false }),
    onCreate: async () => null,
  });

  harness.component().handleInput("\x0e");
  harness.component().handleInput("\x19");
  await page;
  assert.deepEqual(worked, [tasks[1]]);
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
    onWork: async () => {},
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

test("task list Enter starts work once, closes immediately, and surfaces rejection", async () => {
  const harness = makeCustomUiHarness();
  const work = deferred<void>();
  const workedTasks: Task[] = [];
  const task: Task = {
    ref: "demo-work",
    id: "demo-work",
    title: "Work target",
    status: "open",
  };

  const page = showTaskList(harness.ctx, {
    title: "Tasks",
    tasks: [task],
    priorities: ["p0", "p1", "p2", "p3", "p4"],
    closeKey: "x",
    cycleStatus: (status) => status,
    cycleTaskType: () => "task",
    onUpdateTask: async () => {},
    onWork: async (selected) => {
      workedTasks.push(selected);
      await work.promise;
    },
    onInsert: () => {},
    onEdit: async () => ({ updatedTask: null, closeList: false }),
    onCreate: async () => null,
  });

  harness.component().handleInput("\r");
  assert.deepEqual(workedTasks, [task]);
  assert.deepEqual(harness.doneValues, ["cancel"]);
  await page;

  work.reject(new Error("work failed"));
  await flushMicrotasks();
  assert.ok(
    harness.notifications.some(
      ({ message, level }) => level === "error" && message === "work failed"
    )
  );
});

test("task form propagates Focusable state to the active editor cursor", async () => {
  const harness = makeCustomUiHarness();
  const form = showTaskForm(harness.ctx, {
    mode: "create",
    subtitle: "Create",
    task: { ref: "new", title: "題名", description: "説明", status: "open" },
    closeKey: "\x18",
    cycleStatus: (status) => status,
    cycleTaskType: () => "task",
    parsePriorityKey: () => null,
    priorities: ["p0", "p1", "p2"],
    onSave: async () => true,
  });
  const component = harness.component();

  component.focused = true;
  for (const width of [0, 1]) {
    let lines: string[] = [];
    assert.doesNotThrow(() => {
      lines = component.render(width);
    });
    for (const line of lines) {
      assert.ok(visibleWidth(line) <= width, `${visibleWidth(line)} > ${width}`);
    }
  }
  assert.ok(component.render(80).join("\n").includes(CURSOR_MARKER));

  component.focused = false;
  for (const width of [0, 1]) {
    for (const line of component.render(width)) {
      assert.ok(visibleWidth(line) <= width, `${visibleWidth(line)} > ${width}`);
    }
  }
  assert.ok(!component.render(80).join("\n").includes(CURSOR_MARKER));

  component.focused = true;
  component.handleInput("\t");
  assert.ok(component.render(80).join("\n").includes(CURSOR_MARKER));
  component.handleInput("\x1b");
  assert.ok(!component.render(80).join("\n").includes(CURSOR_MARKER));

  component.handleInput("\x18");
  assert.deepEqual(await form, { action: "close_list" });
});

test("task form responsively budgets edit and create layouts", () => {
  const description = Array.from(
    { length: 40 },
    (_, index) => `FORM-DESC-LINE-${String(index + 1).padStart(2, "0")}`
  ).join("\n");
  const richTask: Task = {
    ref: "responsive-edit",
    id: "responsive-edit",
    title: "Responsive edit",
    description,
    status: "open",
    priority: "p2",
    taskType: "task",
    assignee: "agent@example.test",
    owner: "ivan",
    labels: ["responsive", "form"],
    dueAt: "2026-08-01",
    acceptanceCriteria: "Keep all controls visible.",
    design: "Grow the editor first.",
    notes: "OPTIONAL-CONTEXT-TAIL",
  };

  const open = (mode: "edit" | "create", task: Task) => {
    const harness = makeCustomUiHarness();
    void showTaskForm(harness.ctx, {
      mode,
      subtitle: mode === "edit" ? "Edit" : "Create",
      task,
      closeKey: "x",
      cycleStatus: (status) => status,
      cycleTaskType: () => "task",
      parsePriorityKey: () => null,
      priorities: ["p0", "p1", "p2", "p3", "p4"],
      onSave: async () => true,
    });
    return { harness, component: harness.component() };
  };

  for (const [mode, task] of [
    ["edit", richTask],
    ["create", { ...richTask, ref: "new", id: undefined }],
  ] as const) {
    const { harness, component } = open(mode, task);
    for (const rows of [60, 24, 9]) {
      harness.setTerminalRows(rows);
      const lines = component.render(120);
      assert.ok(lines.length <= rows, `${mode} rendered ${lines.length} rows for ${rows}`);
      if (rows >= 24) {
        assert.ok(lines.length >= Math.ceil((rows * 2) / 3));
        const output = lines.join("\n");
        assert.match(output, /Title/);
        assert.match(output, /Description/);
        assert.match(output, /save/);
      }
    }
  }

  const edit = open("edit", richTask);
  edit.harness.setTerminalRows(60);
  const tallOutput = edit.component.render(120).join("\n");
  assert.ok((tallOutput.match(/FORM-DESC-LINE/g) ?? []).length > 8);
  for (const { label, value } of buildReadOnlyTaskContext(richTask, "edit")) {
    assert.ok(tallOutput.includes(`${label}:`), `missing tall label ${label}`);
    assert.ok(tallOutput.includes(value), `missing tall value for ${label}`);
  }

  edit.harness.setTerminalRows(24);
  const shortOutput = edit.component.render(120).join("\n");
  assert.doesNotMatch(shortOutput, /OPTIONAL-CONTEXT-TAIL/);
  assert.match(shortOutput, /Title/);
  assert.match(shortOutput, /Description/);

  for (const rows of [Number.NaN, 0, -1, Number.POSITIVE_INFINITY]) {
    edit.harness.setTerminalRows(rows);
    const lines = edit.component.render(120);
    assert.ok(lines.length >= 16);
    assert.ok(lines.length <= 24);
  }
  edit.harness.setTerminalRows(1_000_000);
  const cappedLines = edit.component.render(120);
  assert.ok(cappedLines.length >= Math.ceil((500 * 2) / 3));
  assert.ok(cappedLines.length <= 500);

  edit.harness.setTerminalRows(60);
  const narrowOutput = edit.component.render(28).join("\n");
  assert.match(narrowOutput, /save/);
  assert.match(narrowOutput, /back/);
  assert.ok(edit.component.render(28).every((line) => visibleWidth(line) <= 28));
});

test("task form prioritizes focused editors and complete footer help in compact layouts", () => {
  const open = (mode: "edit" | "create", active: "title" | "desc") => {
    const harness = makeCustomUiHarness();
    void showTaskForm(harness.ctx, {
      mode,
      subtitle: mode === "edit" ? "Edit" : "Create",
      task: {
        ref: mode === "edit" ? "cursor-edit" : "new",
        id: mode === "edit" ? "cursor-edit" : undefined,
        title: "Cursor title",
        description: Array.from({ length: 30 }, (_, index) => `Cursor line ${index}`).join("\n"),
        status: "open",
      },
      closeKey: "x",
      cycleStatus: (status) => status,
      cycleTaskType: () => "task",
      parsePriorityKey: () => null,
      priorities: ["p0", "p1", "p2"],
      onSave: async () => true,
    });
    const component = harness.component();
    component.focused = true;
    if (mode === "edit") component.handleInput("\t");
    if (active === "desc") component.handleInput("\t");
    return { harness, component };
  };

  const assertFocusedLayout = (
    mode: "edit" | "create",
    active: "title" | "desc",
    rows: number,
    width: number
  ) => {
    const { harness, component } = open(mode, active);
    harness.setTerminalRows(rows);
    const lines = component.render(width);
    const output = lines.join("\n");
    assert.ok(lines.length <= rows, `${mode}/${active} exceeded ${rows} rows`);
    assert.ok(lines.every((line) => visibleWidth(line) <= width));
    assert.equal(output.split(CURSOR_MARKER).length - 1, 1, `${mode}/${active} lost cursor`);
    assert.match(output, active === "title" ? /Title/ : /Description/);
    assert.match(output, /save/);
    assert.match(output, /back/);
    assert.match(output, active === "title" ? /description/ : /newline/);
  };

  for (const mode of ["create", "edit"] as const) {
    for (const active of ["title", "desc"] as const) {
      for (const width of [120, 28]) {
        for (const rows of [9, 10, 11, 12, 13]) {
          assertFocusedLayout(mode, active, rows, width);
        }
      }
    }
  }

  for (const [mode, active] of [
    ["create", "desc"],
    ["edit", "title"],
  ] as const) {
    const { harness, component } = open(mode, active);
    harness.setTerminalRows(60);
    const tallBefore = component.render(80).join("\n");
    harness.setTerminalRows(2);
    const tinyLines = component.render(28);
    assert.ok(tinyLines.length <= 2);
    assert.ok(tinyLines.every((line) => visibleWidth(line) <= 28));
    assert.equal(tinyLines.join("\n").split(CURSOR_MARKER).length - 1, 1);
    assert.deepEqual(component.render(28), tinyLines);
    harness.setTerminalRows(60);
    assert.equal(component.render(80).join("\n"), tallBefore);
  }
});

test("task form applies default description newline and submit semantics", async () => {
  const harness = makeCustomUiHarness();
  const drafts: FormDraft[] = [];
  const form = showTaskForm(harness.ctx, {
    mode: "create",
    subtitle: "Create",
    task: { ref: "new", title: "Title", description: "", status: "open" },
    closeKey: "\x18",
    cycleStatus: (status) => status,
    cycleTaskType: () => "task",
    parsePriorityKey: () => null,
    priorities: ["p0", "p1", "p2"],
    onSave: async (draft) => {
      drafts.push(draft);
      return true;
    },
  });
  const component = harness.component();

  component.focused = true;
  component.handleInput("\t");
  component.handleInput("A");
  component.handleInput("\x0a");
  component.handleInput("B");
  component.handleInput("\r");
  await flushMicrotasks();

  assert.equal(drafts.length, 1);
  assert.equal(drafts[0]?.description, "A\nB");
  component.handleInput("\x18");
  assert.deepEqual(await form, { action: "close_list" });
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
  assert.equal(visibleWidth(row.label), 40);
  assert.deepEqual(decodeDescription(row.description), {
    meta: "◑ feat",
    summary: "First line",
  });
});

test("ANSI and wide-character list rows align and never exceed narrow widths", () => {
  const cjkRow = buildListRowModel(
    { ref: "wide", title: "漢字", status: "open", priority: "p1" },
    { maxLabelWidth: 14 }
  );
  assert.equal(visibleWidth(cjkRow.label), 14);

  const ansi = (text: string) => `\x1b[31m${text}\x1b[0m`;
  const list = new SelectListWithColumns(
    [
      { value: "wide", label: `${ansi("漢字")} title`, description: ansi("説明 text") },
      { value: "plain", label: "plain", description: "description" },
    ],
    2,
    {
      selectedPrefix: ansi,
      selectedText: ansi,
      description: ansi,
      scrollInfo: ansi,
      noMatch: ansi,
    },
    new KeybindingsManager(TUI_KEYBINDINGS),
    { valueMaxWidth: 10, valueColumnWidth: 12, minDescriptionWidth: 1, minWidthForDescription: 0 }
  );

  for (const width of [0, 1, 4, 12, 24]) {
    for (const line of list.render(width)) {
      assert.ok(visibleWidth(line) <= width, `${visibleWidth(line)} > ${width}: ${line}`);
    }
  }
});

test("task list page wraps ANSI and CJK content within every terminal width", async () => {
  const harness = makeCustomUiHarness();
  const page = showTaskList(harness.ctx, {
    title: "任務",
    tasks: [{
      ref: "wide",
      title: "\x1b[31m漢字の長い題名\x1b[0m",
      description: "説明説明説明 \x1b[32mstyled words\x1b[0m",
      status: "open",
    }],
    priorities: ["p0", "p1", "p2"],
    closeKey: "\x18",
    cycleStatus: (status) => status,
    cycleTaskType: () => "task",
    onUpdateTask: async () => {},
    onWork: async () => {},
    onInsert: () => {},
    onEdit: async () => ({ updatedTask: null, closeList: false }),
    onCreate: async () => null,
  });

  for (const width of [0, 1, 8, 20, 40]) {
    for (const line of harness.component().render(width)) {
      assert.ok(visibleWidth(line) <= width, `${visibleWidth(line)} > ${width}`);
    }
  }
  harness.component().handleInput("\x18");
  await page;
});

test("task list page budgets terminal height and gives tall surplus to description", async () => {
  const harness = makeCustomUiHarness();
  const description = Array.from(
    { length: 40 },
    (_, index) => `DESC-01-LINE-${String(index + 1).padStart(2, "0")}`
  ).join("\n");
  const tasks: Task[] = Array.from({ length: 30 }, (_, index) => ({
    ref: `bead-${String(index + 1).padStart(2, "0")}`,
    id: `bead-${String(index + 1).padStart(2, "0")}`,
    title: `List item ${String(index + 1).padStart(2, "0")}`,
    description: index === 0 ? description : `Description for item ${index + 1}`,
    status: "open",
  }));
  const page = showTaskList(harness.ctx, {
    title: "Tasks",
    subtitle: "height regression",
    tasks,
    priorities: ["p0", "p1", "p2"],
    closeKey: "x",
    cycleStatus: (status) => status,
    cycleTaskType: () => "task",
    onUpdateTask: async () => {},
    onWork: async () => {},
    onInsert: () => {},
    onEdit: async () => ({ updatedTask: null, closeList: false }),
    onCreate: async () => null,
  });
  const component = harness.component();
  const width = 120;
  const previewLines = (lines: string[]) =>
    lines.map((line) => line.trim()).filter((line) => /^DESC-01-LINE-\d{2}$/.test(line));
  const visibleTaskLines = (lines: string[]) =>
    lines.filter((line) => /^(?:→ |  ).*List item \d{2}/.test(line));

  harness.setTerminalRows(60);
  const tall = component.render(width);
  assert.ok(tall.length >= Math.ceil((60 * 2) / 3));
  assert.ok(tall.length <= 60);
  assert.ok(tall.every((line) => visibleWidth(line) <= width));
  assert.equal(visibleTaskLines(tall).length, 10);
  const tallPreview = previewLines(tall);
  assert.ok(tallPreview.length > 7);
  assert.equal(tallPreview[0], "DESC-01-LINE-01");

  component.handleInput("j");
  const scrolledPreview = previewLines(component.render(width));
  assert.equal(scrolledPreview.length, tallPreview.length);
  assert.equal(scrolledPreview[0], "DESC-01-LINE-02");
  assert.notEqual(scrolledPreview.at(-1), tallPreview.at(-1));

  harness.setTerminalRows(24);
  const small = component.render(width);
  assert.ok(small.length >= Math.ceil((24 * 2) / 3));
  assert.ok(small.length <= 24);
  assert.ok(small.every((line) => visibleWidth(line) <= width));
  assert.ok(visibleTaskLines(small).length < 10);
  assert.equal(previewLines(small)[0], "DESC-01-LINE-02");

  const assertFullFooter = (lines: string[]) => {
    const rendered = lines.join(" ");
    assert.match(rendered, /enter work/);
    assert.match(rendered, /escape[^ ]* cancel/);
    assert.match(rendered, /x close/);
    assert.match(rendered, /space status/);
    assert.match(rendered, /j\/k scroll/);
    assert.match(lines.at(-1) ?? "", /^─/);
  };

  for (const rows of [9, 10, 11, 12]) {
    harness.setTerminalRows(rows);
    const short = component.render(width);
    assert.ok(short.length <= rows);
    assert.ok(short.every((line) => visibleWidth(line) <= width));
    assertFullFooter(short);
  }

  harness.setTerminalRows(11);
  const narrow = component.render(60);
  assert.ok(narrow.length <= 11);
  assertFullFooter(narrow);

  harness.setTerminalRows(7);
  assert.equal(visibleTaskLines(component.render(width)).length, 0);
  component.handleInput("s");
  harness.setTerminalRows(12);
  assert.match(
    visibleTaskLines(component.render(width)).find((line) => line.startsWith("→ ")) ?? "",
    /List item 02/
  );

  harness.setTerminalRows(Number.NaN);
  const fallback = component.render(width);
  assert.ok(fallback.length >= Math.ceil((24 * 2) / 3));
  assert.ok(fallback.length <= 24);

  for (const invalidRows of [0, -10, Number.POSITIVE_INFINITY]) {
    harness.setTerminalRows(invalidRows);
    assert.equal(component.render(width).length, fallback.length);
  }

  harness.setTerminalRows(1_000_000_000);
  const capped = component.render(width);
  assert.ok(capped.length >= Math.ceil((500 * 2) / 3));
  assert.ok(capped.length <= 500);

  component.handleInput("x");
  await page;
});

test("list rows distinguish stored blocked status from active dependency blockers", () => {
  const dependencyBlocked: Task = {
    ref: "demo-open",
    id: "demo-open",
    title: "Open but blocked",
    status: "open",
    blockedBy: [{ ref: "demo-prereq" }],
  };
  const storedBlocked: Task = {
    ref: "demo-blocked",
    id: "demo-blocked",
    title: "Stored blocked",
    status: "blocked",
  };

  assert.equal(buildTaskListTextParts(dependencyBlocked).meta, "○ task blocked:1");
  assert.equal(buildTaskListTextParts(storedBlocked).meta, "✖ task");
});

test("structured task context has stable ordering and omits sparse optional fields", () => {
  const sparse = buildTaskContext({
    ref: "demo-sparse",
    title: "Sparse",
    status: "open",
  });
  assert.deepEqual(sparse, [
    { key: "id", label: "ID", value: "demo-sparse" },
    { key: "status", label: "Status", value: "open" },
  ]);

  const rich = buildTaskContext({
    ref: "fallback",
    id: "demo-rich",
    title: "Rich",
    status: "inProgress",
    priority: "p1",
    taskType: "feature",
    assignee: "agent@example.test",
    owner: "ivan",
    labels: ["backend", "urgent"],
    dueAt: "2026-08-01",
    description: "Description",
    acceptanceCriteria: "Acceptance",
    design: "Design",
    notes: "Notes",
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-02T00:00:00Z",
    dependencyCount: 2,
    dependentCount: 1,
    commentCount: 3,
    blockedBy: [{ ref: "demo-prereq", title: "Foundation", status: "open" }],
    dependencies: [
      { ref: "demo-prereq", title: "Foundation", status: "open" },
      { ref: "demo-related", dependencyType: "related" },
    ],
  });
  assert.deepEqual(
    rich.map(({ key }) => key),
    [
      "id",
      "status",
      "blockers",
      "dependencies",
      "priority",
      "type",
      "assignee",
      "owner",
      "labels",
      "due",
      "description",
      "acceptanceCriteria",
      "design",
      "notes",
    ]
  );
  assert.equal(rich.find(({ key }) => key === "blockers")?.value, "demo-prereq (Foundation; open)");
  assert.equal(rich.find(({ key }) => key === "dependencies")?.value, "demo-related [related]");
});

test("edit hydration always calls show and exposes rich fields read-only only in edit mode", async () => {
  const listed: Task = {
    ref: "demo-edit",
    id: "demo-edit",
    title: "List title",
    description: "List description is already present",
    status: "open",
  };
  const shown: Task = {
    ...listed,
    title: "Shown title",
    acceptanceCriteria: "Complete context",
  };
  const refs: string[] = [];
  const hydrated = await hydrateTaskForEdit(
    { show: async (ref) => { refs.push(ref); return shown; } },
    listed.ref,
    listed
  );
  assert.deepEqual(refs, ["demo-edit"]);
  assert.equal(hydrated.title, "Shown title");
  assert.deepEqual(
    buildReadOnlyTaskContext(hydrated, "edit").map(({ key }) => key),
    ["id", "acceptanceCriteria"]
  );
  assert.deepEqual(buildReadOnlyTaskContext(hydrated, "create"), []);
});

test("rich edit form render includes every read-only context field and exact ID", () => {
  const harness = makeCustomUiHarness();
  harness.setTerminalRows(60);
  const task: Task = {
    ref: "fallback-ref",
    id: "demo-rich-exact-id",
    title: "Rich edit",
    description: "Editable description",
    status: "inProgress",
    priority: "p1",
    taskType: "feature",
    assignee: "agent@example.test",
    owner: "ivan",
    labels: ["backend", "urgent"],
    dueAt: "2026-08-01",
    acceptanceCriteria: "All focused checks pass.",
    design: "Hydrate before rendering.",
    notes: "Use sanitized fixture data.",
    blockedBy: [{ ref: "demo-prereq", title: "Foundation", status: "open" }],
    dependencies: [
      { ref: "demo-prereq", title: "Foundation", status: "open" },
      { ref: "demo-related", title: "Related decision", status: "closed", dependencyType: "related" },
    ],
  };

  void showTaskForm(harness.ctx, {
    mode: "edit",
    subtitle: "Edit",
    task,
    closeKey: "x",
    cycleStatus: (status) => status,
    cycleTaskType: () => "feature",
    parsePriorityKey: () => null,
    priorities: ["p0", "p1", "p2", "p3", "p4"],
    onSave: async () => true,
  });

  const rendered = harness.component().render(160).join("\n");
  const readOnlyFields = buildReadOnlyTaskContext(task, "edit");
  assert.deepEqual(readOnlyFields.map(({ key }) => key), [
    "id",
    "blockers",
    "dependencies",
    "assignee",
    "owner",
    "labels",
    "due",
    "acceptanceCriteria",
    "design",
    "notes",
  ]);
  for (const { label, value } of readOnlyFields) {
    assert.ok(rendered.includes(`${label}:`), `missing rendered label ${label}`);
    assert.ok(rendered.includes(value), `missing rendered value for ${label}`);
  }
  assert.match(rendered, /ID: demo-rich-exact-id/);
});

test("work claims first, preserves hydrated blockers, and stops on claim or show failure", async () => {
  const listed: Task = {
    ref: "demo-open",
    id: "demo-open",
    title: "Stale title",
    description: "Stale description",
    status: "open",
    blockedBy: [{ ref: "demo-prereq" }],
  };
  const shown: Task = {
    ref: "demo-open",
    id: "demo-open",
    title: "Hydrated title",
    description: "Complete description",
    status: "open",
    dependencies: [{ ref: "demo-prereq", title: "Foundation", status: "open" }],
  };
  assert.deepEqual(mergeHydratedTask(listed, shown).blockedBy, [
    { ref: "demo-prereq", title: "Foundation", status: "open" },
  ]);

  const prompts: string[] = [];
  const notifications: string[] = [];
  const calls: string[] = [];
  const successful = createTaskWorkHandler(
    {
      claim: async (ref) => { calls.push(`claim:${ref}`); },
      show: async (ref) => { calls.push(`show:${ref}`); return shown; },
    },
    (prompt) => prompts.push(prompt),
    (message) => notifications.push(message)
  );
  await successful(listed);
  assert.deepEqual(calls, ["claim:demo-open", "show:demo-open"]);
  assert.equal(prompts.length, 1);
  assert.match(prompts[0] ?? "", /^Work on task demo-open: Hydrated title/);
  assert.match(prompts[0] ?? "", /WARNING:.*demo-prereq/);
  assert.match(prompts[0] ?? "", /Active blockers: demo-prereq \(Foundation; open\)/);
  assert.doesNotMatch(prompts[0] ?? "", /bd prime|execute-beads/i);

  await successful({ ...listed, assignee: "ivan" });
  assert.deepEqual(calls, [
    "claim:demo-open",
    "show:demo-open",
    "claim:demo-open",
    "show:demo-open",
  ]);
  assert.equal(prompts.length, 2);

  const failedCalls: string[] = [];
  const failed = createTaskWorkHandler(
    {
      claim: async (ref) => {
        failedCalls.push(`claim:${ref}`);
        throw new Error("issue already claimed by another actor");
      },
      show: async (ref) => {
        failedCalls.push(`show:${ref}`);
        return shown;
      },
    },
    (prompt) => prompts.push(prompt),
    (message) => notifications.push(message)
  );
  await failed(listed);
  assert.deepEqual(failedCalls, ["claim:demo-open"]);
  assert.equal(prompts.length, 2);
  assert.deepEqual(notifications, ["issue already claimed by another actor"]);

  const showFailedCalls: string[] = [];
  const showFailedNotifications: string[] = [];
  const showFailed = createTaskWorkHandler(
    {
      claim: async (ref) => {
        showFailedCalls.push(`claim:${ref}`);
      },
      show: async (ref) => {
        showFailedCalls.push(`show:${ref}`);
        throw new Error("failed to load claimed issue");
      },
    },
    (prompt) => prompts.push(prompt),
    (message) => showFailedNotifications.push(message)
  );
  await showFailed(listed);
  assert.deepEqual(showFailedCalls, ["claim:demo-open", "show:demo-open"]);
  assert.equal(prompts.length, 2);
  assert.deepEqual(showFailedNotifications, ["failed to load claimed issue"]);
});

test("task serialization and rich work prompts preserve exact execution context", () => {
  const task: Task = {
    ref: "fallback-ref",
    id: "junk-8dn.1",
    title: "Portable harness",
    description: "Line one\nLine two",
    status: "inProgress",
    priority: "p1",
    taskType: "task",
    assignee: "agent@example.test",
    owner: "ivan",
    labels: ["backend", "urgent"],
    dueAt: "2026-08-01",
    acceptanceCriteria: "All focused checks pass.",
    design: "Hydrate before rendering.",
    notes: "Keep blocker warning actionable.",
    blockedBy: [{ ref: "demo-prereq", title: "Foundation", status: "open" }],
    dependencies: [
      { ref: "demo-prereq", title: "Foundation", status: "open" },
      { ref: "demo-related", title: "Related decision", status: "closed", dependencyType: "related" },
    ],
  };

  assert.equal(
    serializeTask(task),
    'task(id=junk-8dn.1, title="Portable harness", status=in-progress, priority=p1, type=task, description="Line one\\nLine two", due="2026-08-01")'
  );
  assert.equal(
    buildTaskWorkPrompt(task),
    "Work on task junk-8dn.1: Portable harness\n\nWARNING: This task is actively blocked by demo-prereq. Resolve or account for these blockers before proceeding.\n\nStatus: in-progress\n\nActive blockers: demo-prereq (Foundation; open)\n\nDependencies: demo-related (Related decision; closed) [related]\n\nPriority: p1\n\nType: task\n\nAssignee: agent@example.test\n\nOwner: ivan\n\nLabels: backend, urgent\n\nDue: 2026-08-01\n\nDescription:\nLine one\nLine two\n\nAcceptance criteria:\nAll focused checks pass.\n\nDesign:\nHydrate before rendering.\n\nNotes:\nKeep blocker warning actionable."
  );

  const sparsePrompt = buildTaskWorkPrompt({
    ref: "demo-sparse",
    title: "Sparse",
    status: "open",
  });
  assert.equal(sparsePrompt, "Work on task demo-sparse: Sparse\n\nStatus: open");
  assert.doesNotMatch(sparsePrompt, /ID:|unknown|undefined|null/);
});
