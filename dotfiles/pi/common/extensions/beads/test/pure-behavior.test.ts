import assert from "node:assert/strict";
import test from "node:test";
import {
  buildListPrimaryHelpText,
  resolveListIntent,
  type ListControllerState,
} from "../controllers/list.ts";
import {
  getHeaderStatus,
  isSameDraft,
  normalizeDraft,
  type FormDraft,
} from "../controllers/show.ts";
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
