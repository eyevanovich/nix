import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { PartialTaskCreateError } from "../backend/api.ts";
import beadsInitializer from "../backend/adapters/beads.ts";

interface CommandResult {
  stdout?: string;
  stderr?: string;
  code?: number;
}

interface CommandCall {
  command: string;
  args: string[];
  timeout: number | undefined;
}

function makeHarness(results: CommandResult[]) {
  const calls: CommandCall[] = [];
  let activeCalls = 0;
  let maxActiveCalls = 0;

  const pi = {
    async exec(command: string, args: string[], options?: { timeout?: number }) {
      calls.push({ command, args: [...args], timeout: options?.timeout });
      activeCalls += 1;
      maxActiveCalls = Math.max(maxActiveCalls, activeCalls);
      await Promise.resolve();
      activeCalls -= 1;

      const result = results.shift();
      if (!result) throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
      return {
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        code: result.code ?? 0,
        killed: false,
      };
    },
  } as unknown as ExtensionAPI;

  return {
    adapter: beadsInitializer.initialize(pi),
    calls,
    maxActiveCalls: () => maxActiveCalls,
  };
}

function json(value: unknown): CommandResult {
  return { stdout: JSON.stringify(value) };
}

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
}

test("adapter serializes commands and continues after a rejected command", async () => {
  const firstResult = deferred<{
    stdout: string;
    stderr: string;
    code: number;
    killed: boolean;
  }>();
  const secondResult = deferred<{
    stdout: string;
    stderr: string;
    code: number;
    killed: boolean;
  }>();
  const results = [firstResult, secondResult];
  const calls: CommandCall[] = [];

  const pi = {
    exec(command: string, args: string[], options?: { timeout?: number }) {
      calls.push({ command, args: [...args], timeout: options?.timeout });
      const result = results.shift();
      if (!result) throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
      return result.promise;
    },
  } as unknown as ExtensionAPI;
  const adapter = beadsInitializer.initialize(pi);

  const failedUpdate = adapter.update("demo-1", { status: "closed" });
  const shownTask = adapter.show("demo-2");
  const rejectedUpdate = assert.rejects(failedUpdate, /first command failed/);

  await flushMicrotasks();
  assert.equal(calls.length, 1);

  firstResult.resolve({
    stdout: "",
    stderr: "first command failed",
    code: 2,
    killed: false,
  });
  await rejectedUpdate;
  await flushMicrotasks();

  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(({ args }) => args), [
    ["update", "demo-1", "--status", "closed"],
    ["show", "demo-2", "--json"],
  ]);

  secondResult.resolve({
    stdout: JSON.stringify([{ id: "demo-2", title: "Queued", status: "open" }]),
    stderr: "",
    code: 0,
    killed: false,
  });
  assert.equal((await shownTask).ref, "demo-2");
});

test("list runs status queries sequentially, maps issues, deduplicates, and sorts", async () => {
  const harness = makeHarness([
    json([
      { id: "demo-a", title: "Open A", status: "open", priority: 2 },
      { id: "demo-dup", title: "Open wins", status: "open", priority: 4 },
    ]),
    json([
      { id: "demo-b", title: "Active B", status: "in_progress", priority: 1 },
      { id: "demo-dup", title: "Earlier duplicate", status: "in_progress", priority: 0 },
    ]),
    json([{ id: "demo-c", title: "Blocked C", status: "blocked", priority: 0 }]),
  ]);

  const tasks = await harness.adapter.list();

  assert.deepEqual(
    harness.calls.map(({ command, args, timeout }) => ({ command, args, timeout })),
    [
      {
        command: "bd",
        args: ["list", "--status", "open", "--limit", "100", "--json"],
        timeout: 30_000,
      },
      {
        command: "bd",
        args: ["list", "--status", "in_progress", "--limit", "100", "--json"],
        timeout: 30_000,
      },
      {
        command: "bd",
        args: ["list", "--status", "blocked", "--limit", "100", "--json"],
        timeout: 30_000,
      },
    ]
  );
  assert.equal(harness.maxActiveCalls(), 1);
  assert.deepEqual(
    tasks.map(({ ref, title, status, priority }) => ({ ref, title, status, priority })),
    [
      { ref: "demo-b", title: "Active B", status: "inProgress", priority: "p1" },
      { ref: "demo-a", title: "Open A", status: "open", priority: "p2" },
      { ref: "demo-dup", title: "Open wins", status: "open", priority: "p4" },
      { ref: "demo-c", title: "Blocked C", status: "blocked", priority: "p0" },
    ]
  );
});

test("show requests one task and maps optional JSON fields", async () => {
  const harness = makeHarness([
    json([
      {
        id: "demo-42",
        title: "Mapped task",
        description: "Details",
        status: "closed",
        priority: 3,
        issue_type: "bug",
        owner: "Ivan",
        created_at: "2026-01-01",
        due: "2026-02-01",
        updated_at: "2026-01-02",
        dependency_count: 2,
        dependent_count: 1,
        comment_count: 4,
      },
    ]),
  ]);

  const task = await harness.adapter.show("demo-42");

  assert.deepEqual(harness.calls[0], {
    command: "bd",
    args: ["show", "demo-42", "--json"],
    timeout: 30_000,
  });
  assert.deepEqual(task, {
    ref: "demo-42",
    id: "demo-42",
    title: "Mapped task",
    description: "Details",
    status: "closed",
    priority: "p3",
    taskType: "bug",
    owner: "Ivan",
    createdAt: "2026-01-01",
    dueAt: "2026-02-01",
    updatedAt: "2026-01-02",
    dependencyCount: 2,
    dependentCount: 1,
    commentCount: 4,
  });
});

test("create builds exact argv and applies a non-open status", async () => {
  const harness = makeHarness([
    json({ id: "demo-new", title: "backend title", status: "open", priority: 1 }),
    { stdout: "" },
  ]);

  const task = await harness.adapter.create({
    title: "  New task  ",
    description: "Task details",
    status: "blocked",
    priority: "p1",
    taskType: "bug",
    dueAt: "2026-08-01",
  });

  assert.deepEqual(
    harness.calls.map(({ args }) => args),
    [
      [
        "create",
        "--title",
        "New task",
        "--due",
        "2026-08-01",
        "--description",
        "Task details",
        "--priority",
        "1",
        "--type",
        "bug",
        "--json",
      ],
      ["update", "demo-new", "--status", "blocked"],
    ]
  );
  assert.deepEqual(
    {
      ref: task.ref,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      taskType: task.taskType,
      dueAt: task.dueAt,
    },
    {
      ref: "demo-new",
      title: "New task",
      description: "Task details",
      status: "blocked",
      priority: "p1",
      taskType: "bug",
      dueAt: "2026-08-01",
    }
  );
});

test("partial create failure refreshes the exact persisted task state", async () => {
  const harness = makeHarness([
    json({ id: "demo-partial", title: "Create response", status: "open", priority: 4 }),
    { code: 2, stderr: "status update failed" },
    json([
      {
        id: "demo-partial",
        title: "Backend-normalized",
        description: "Persisted details",
        status: "open",
        priority: 3,
        issue_type: "feature",
      },
    ]),
  ]);

  await assert.rejects(
    harness.adapter.create({
      title: "Partial",
      description: "Requested details",
      status: "blocked",
      priority: "p1",
      taskType: "bug",
    }),
    (error: unknown) => {
      assert.ok(error instanceof PartialTaskCreateError);
      assert.equal(error.requestedStatus, "blocked");
      assert.deepEqual(error.createdTask, {
        ref: "demo-partial",
        id: "demo-partial",
        title: "Backend-normalized",
        description: "Persisted details",
        status: "open",
        owner: undefined,
        priority: "p3",
        taskType: "feature",
      });
      assert.match(error.message, /demo-partial was created with status open/);
      assert.match(error.message, /setting status to blocked failed: status update failed/);
      return true;
    }
  );

  assert.deepEqual(
    harness.calls.map(({ args }) => args),
    [
      [
        "create",
        "--title",
        "Partial",
        "--description",
        "Requested details",
        "--priority",
        "1",
        "--type",
        "bug",
        "--json",
      ],
      ["update", "demo-partial", "--status", "blocked"],
      ["show", "demo-partial", "--json"],
    ]
  );
});

test("partial create refresh failure falls back to the unmodified create response", async () => {
  const harness = makeHarness([
    json({ id: "demo-fallback", title: "Backend snapshot", status: "open", priority: 4 }),
    { code: 2, stderr: "status update failed" },
    { code: 3, stderr: "refresh failed" },
  ]);

  await assert.rejects(
    harness.adapter.create({
      title: "Requested title",
      description: "Requested details",
      status: "blocked",
      priority: "p1",
      taskType: "bug",
    }),
    (error: unknown) => {
      assert.ok(error instanceof PartialTaskCreateError);
      assert.deepEqual(error.createdTask, {
        ref: "demo-fallback",
        id: "demo-fallback",
        title: "Backend snapshot",
        description: "",
        status: "open",
        owner: undefined,
        priority: "p4",
      });
      assert.match(error.message, /setting status to blocked failed: status update failed/);
      assert.doesNotMatch(error.message, /refresh failed/);
      assert.equal((error.cause as Error).message, "status update failed");
      return true;
    }
  );

  assert.deepEqual(harness.calls.map(({ args }) => args), [
    [
      "create",
      "--title",
      "Requested title",
      "--description",
      "Requested details",
      "--priority",
      "1",
      "--type",
      "bug",
      "--json",
    ],
    ["update", "demo-fallback", "--status", "blocked"],
    ["show", "demo-fallback", "--json"],
  ]);
});

test("update translates all supported fields and trims the title", async () => {
  const harness = makeHarness([{ stdout: "" }]);

  await harness.adapter.update("demo-7", {
    title: "  Revised  ",
    description: "Description",
    status: "inProgress",
    priority: "p0",
    taskType: "feature",
    dueAt: "tomorrow",
  });

  assert.deepEqual(harness.calls[0]?.args, [
    "update",
    "demo-7",
    "--title",
    "Revised",
    "--description",
    "Description",
    "--status",
    "in_progress",
    "--priority",
    "0",
    "--type",
    "feature",
    "--due",
    "tomorrow",
  ]);
});

test("empty update is a no-op", async () => {
  const harness = makeHarness([]);

  await harness.adapter.update("demo-7", {});

  assert.deepEqual(harness.calls, []);
});

test("malformed JSON and unexpected JSON shapes include command context", async () => {
  const malformedList = makeHarness([{ stdout: "not-json" }, json([]), json([])]);
  await assert.rejects(malformedList.adapter.list(), /Failed to parse bd output \(list open\)/);

  const malformedShow = makeHarness([json({ id: "demo-1" })]);
  await assert.rejects(
    malformedShow.adapter.show("demo-1"),
    /Failed to parse bd output \(show demo-1\): expected JSON array/
  );

  const malformedCreate = makeHarness([json([])]);
  await assert.rejects(
    malformedCreate.adapter.create({ title: "Task" }),
    /Failed to parse bd output \(create\): expected JSON object/
  );
});

test("show reports an empty result as not found", async () => {
  const harness = makeHarness([json([])]);

  await assert.rejects(harness.adapter.show("missing"), /Task not found: missing/);
});

test("command failures surface stderr and stop further work", async () => {
  const harness = makeHarness([{ code: 2, stderr: "database unavailable" }]);

  await assert.rejects(harness.adapter.list(), /database unavailable/);
  assert.equal(harness.calls.length, 1);
});
