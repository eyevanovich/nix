import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

function fixture(name: "list" | "blocked" | "show" | "create" | "update"): CommandResult {
  return {
    stdout: readFileSync(new URL(`./fixtures/bd-1.1/${name}.json`, import.meta.url), "utf8"),
  };
}

function makeHarness(results: CommandResult[]) {
  const calls: CommandCall[] = [];

  const pi = {
    async exec(command: string, args: string[], options?: { timeout?: number }) {
      calls.push({ command, args: [...args], timeout: options?.timeout });
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

  return { adapter: beadsInitializer.initialize(pi), calls };
}

function json(value: unknown): CommandResult {
  return { stdout: JSON.stringify(value) };
}

function customTypes(value: string): CommandResult {
  return json({ key: "types.custom", schema_version: 1, value });
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
  const successfulUpdate = adapter.update("demo-2", { status: "inProgress" });
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
    ["update", "demo-1", "--status", "closed", "--json"],
    ["update", "demo-2", "--status", "in_progress", "--json"],
  ]);

  secondResult.resolve({
    stdout: JSON.stringify([
      { id: "demo-2", title: "Queued update", status: "in_progress" },
    ]),
    stderr: "",
    code: 0,
    killed: false,
  });
  await successfulUpdate;
});

test("list uses one exact active-work query and intentionally excludes deferred and closed", async () => {
  const harness = makeHarness([customTypes(""), fixture("list"), fixture("blocked")]);

  const tasks = await harness.adapter.list();

  assert.deepEqual(harness.calls, [
    {
      command: "bd",
      args: ["config", "get", "types.custom", "--json"],
      timeout: 30_000,
    },
    {
      command: "bd",
      args: [
        "list",
        "--status",
        "open,in_progress,blocked",
        "--limit",
        "100",
        "--json",
      ],
      timeout: 30_000,
    },
    {
      command: "bd",
      args: ["blocked", "--json"],
      timeout: 30_000,
    },
  ]);
  assert.equal(harness.calls.filter(({ args }) => args[0] === "list").length, 1);
  assert.ok(!harness.calls[1]?.args.includes("deferred"));
  assert.ok(!harness.calls[1]?.args.includes("closed"));
  assert.equal(tasks.find(({ ref }) => ref === "demo-ready")?.blockedBy, undefined);
  assert.deepEqual(tasks.find(({ ref }) => ref === "demo-open")?.blockedBy, [
    { ref: "demo-prereq" },
  ]);
  assert.deepEqual(tasks.find(({ ref }) => ref === "demo-open")?.dependencies, [
    { ref: "demo-prereq", dependencyType: "blocks" },
  ]);
  assert.deepEqual(
    tasks.map(({ ref, status, priority }) => ({ ref, status, priority })),
    [
      { ref: "demo-active", status: "inProgress", priority: "p1" },
      { ref: "demo-ready", status: "open", priority: "p1" },
      { ref: "demo-open", status: "open", priority: "p2" },
      { ref: "demo-blocked", status: "blocked", priority: "p0" },
    ]
  );
});

test("list rejects a missing issue ID before loading blockers", async () => {
  const harness = makeHarness([
    customTypes(""),
    json([{ title: "Missing ID", status: "open" }]),
    json([]),
  ]);

  await assert.rejects(
    harness.adapter.list(),
    /Failed to parse bd output \(list active\): expected nonblank string at \$\[0\]\.id/
  );
  assert.equal(harness.calls.length, 2);
});

test("list naturally sorts task IDs within equal status and priority", async () => {
  const harness = makeHarness([
    customTypes(""),
    json([
      { id: "platform-cy7.20", title: "Twenty", status: "open", priority: 2 },
      { id: "platform-cy7.3", title: "Three", status: "open", priority: 2 },
      { id: "platform-cy7.16", title: "Sixteen", status: "open", priority: 2 },
      { id: "platform-cy7.2", title: "Two", status: "open", priority: 2 },
    ]),
    json([]),
  ]);

  const tasks = await harness.adapter.list();

  assert.deepEqual(tasks.map(({ ref }) => ref), [
    "platform-cy7.2",
    "platform-cy7.3",
    "platform-cy7.16",
    "platform-cy7.20",
  ]);
});

test("list omits deferred and closed results even if the backend returns them", async () => {
  const harness = makeHarness([
    customTypes(""),
    json([
      { id: "demo-open", title: "Open", status: "open" },
      { id: "demo-deferred", title: "Deferred", status: "deferred" },
      { id: "demo-closed", title: "Closed", status: "closed" },
    ]),
    json([]),
  ]);

  const tasks = await harness.adapter.list();

  assert.deepEqual(tasks.map(({ ref }) => ref), ["demo-open"]);
});

test("list merges trimmed unique custom types without losing bd 1.1 built-ins", async () => {
  const harness = makeHarness([
    customTypes("research, bug, research, spike, decision"),
    json([]),
    json([]),
  ]);

  await harness.adapter.list();

  assert.deepEqual(harness.adapter.taskTypes, [
    "task",
    "feature",
    "bug",
    "chore",
    "epic",
    "decision",
    "research",
    "spike",
  ]);
});

test("empty custom type metadata preserves all bd 1.1 built-ins", async () => {
  const harness = makeHarness([customTypes(""), json([]), json([])]);

  await harness.adapter.list();

  assert.deepEqual(harness.adapter.taskTypes, [
    "task",
    "feature",
    "bug",
    "chore",
    "epic",
    "decision",
  ]);
});

test("unknown backend statuses fail with command and field context", async () => {
  const harness = makeHarness([
    customTypes(""),
    json([{ id: "demo-unknown", title: "Unknown", status: "archived" }]),
    json([]),
  ]);

  await assert.rejects(
    harness.adapter.list(),
    /Failed to parse bd output \(list active\): Unsupported status from beads backend at \$\[0\]\.status/
  );
});

test("claim uses exact argv for idle and already-owned tasks", async () => {
  const idle = makeHarness([
    json([{ id: "demo-idle", title: "Idle", status: "in_progress", assignee: "ivan" }]),
  ]);
  await idle.adapter.claim("demo-idle");
  assert.deepEqual(idle.calls.map(({ args }) => args), [
    ["update", "demo-idle", "--claim", "--json"],
  ]);

  const alreadyOwned = makeHarness([
    json([{ id: "demo-owned", title: "Owned", status: "in_progress", assignee: "ivan" }]),
  ]);
  await alreadyOwned.adapter.claim("demo-owned");
  assert.deepEqual(alreadyOwned.calls.map(({ args }) => args), [
    ["update", "demo-owned", "--claim", "--json"],
  ]);
});

test("claim failures surface bd errors", async () => {
  const harness = makeHarness([{ code: 2, stderr: "issue already claimed by another actor" }]);

  await assert.rejects(
    harness.adapter.claim("demo-contested"),
    /issue already claimed by another actor/
  );
  assert.deepEqual(harness.calls.map(({ args }) => args), [
    ["update", "demo-contested", "--claim", "--json"],
  ]);
});

test("show consumes the captured bd 1.1 array shape", async () => {
  const harness = makeHarness([fixture("show")]);

  const task = await harness.adapter.show("demo-show");

  assert.deepEqual(harness.calls[0]?.args, ["show", "demo-show", "--json"]);
  assert.deepEqual(task, {
    ref: "demo-show",
    id: "demo-show",
    title: "Shown task",
    description: "Captured from bd show",
    status: "closed",
    priority: "p3",
    taskType: "decision",
    assignee: "agent@example.test",
    owner: "ivan",
    labels: ["backend", "urgent"],
    acceptanceCriteria: "All focused checks pass.",
    design: "Hydrate before rendering.",
    notes: "Use sanitized fixture data.",
    dependencies: [
      {
        ref: "demo-prereq",
        title: "Required foundation",
        status: "open",
        dependencyType: "blocks",
      },
      {
        ref: "demo-related",
        title: "Related decision",
        status: "closed",
        dependencyType: "related",
      },
    ],
    createdAt: "2026-07-10T12:00:00Z",
    dueAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-07-14T09:30:00Z",
    dependencyCount: 2,
    dependentCount: 1,
    commentCount: 4,
  });
});

test("create consumes the captured bd 1.1 object shape", async () => {
  const harness = makeHarness([fixture("create")]);

  const task = await harness.adapter.create({ title: "  Created task  " });

  assert.deepEqual(harness.calls[0]?.args, [
    "create",
    "--title",
    "Created task",
    "--priority",
    "2",
    "--type",
    "task",
    "--json",
  ]);
  assert.equal(task.ref, "demo-created");
  assert.equal(task.status, "open");
  assert.equal(task.taskType, "task");
});

test("update requests and consumes the captured bd 1.1 array shape", async () => {
  const harness = makeHarness([fixture("update")]);

  await harness.adapter.update("demo-updated", {
    title: "  Updated task  ",
    description: "Captured from bd update",
    status: "inProgress",
    priority: "p1",
    taskType: "feature",
    dueAt: "tomorrow",
  });

  assert.deepEqual(harness.calls[0]?.args, [
    "update",
    "demo-updated",
    "--title",
    "Updated task",
    "--description",
    "Captured from bd update",
    "--status",
    "in_progress",
    "--priority",
    "1",
    "--type",
    "feature",
    "--due",
    "tomorrow",
    "--json",
  ]);
});

test("create builds exact argv and applies a non-open status", async () => {
  const harness = makeHarness([
    json({ id: "demo-new", title: "backend title", status: "open", priority: 1 }),
    json([{ id: "demo-new", title: "backend title", status: "blocked", priority: 1 }]),
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
      ["update", "demo-new", "--status", "blocked", "--json"],
    ]
  );
  assert.equal(task.status, "blocked");
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
      assert.equal((error.cause as Error).message, "status update failed");
      return true;
    }
  );

  assert.deepEqual(harness.calls.map(({ args }) => args), [
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
    ["update", "demo-partial", "--status", "blocked", "--json"],
    ["show", "demo-partial", "--json"],
  ]);
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
      assert.equal(error.requestedStatus, "blocked");
      assert.match(error.message, /demo-fallback was created with status open/);
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
    ["update", "demo-fallback", "--status", "blocked", "--json"],
    ["show", "demo-fallback", "--json"],
  ]);
});

test("empty update is a no-op", async () => {
  const harness = makeHarness([]);
  await harness.adapter.update("demo-7", {});
  assert.deepEqual(harness.calls, []);
});

test("malformed JSON and unexpected bd 1.1 JSON shapes include command context", async () => {
  const syntacticallyMalformedList = makeHarness([customTypes(""), { stdout: "not-json" }]);
  await assert.rejects(
    syntacticallyMalformedList.adapter.list(),
    /Failed to parse bd output \(list active\)/
  );
  assert.equal(syntacticallyMalformedList.calls.length, 2);

  const malformedList = makeHarness([customTypes(""), json({})]);
  await assert.rejects(
    malformedList.adapter.list(),
    /Failed to parse bd output \(list active\): expected JSON array/
  );

  const malformedBlocked = makeHarness([customTypes(""), json([]), json({})]);
  await assert.rejects(
    malformedBlocked.adapter.list(),
    /Failed to parse bd output \(blocked active\): expected JSON array/
  );

  const malformedClaim = makeHarness([json({ id: "demo-1" })]);
  await assert.rejects(
    malformedClaim.adapter.claim("demo-1"),
    /Failed to parse bd output \(claim demo-1\): expected JSON array/
  );

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

  const malformedUpdate = makeHarness([json({})]);
  await assert.rejects(
    malformedUpdate.adapter.update("demo-1", { title: "Updated" }),
    /Failed to parse bd output \(update demo-1\): expected JSON array/
  );
});

test("issue records are validated across list, show, create, update, and claim responses", async () => {
  const valid = { id: "demo-1", title: "Task", status: "open" };
  const invalid: Array<{ record: unknown; field: string }> = [
    { record: null, field: "" },
    { record: [], field: "" },
    { record: 42, field: "" },
    { record: { title: "Missing ID", status: "open" }, field: ".id" },
    { record: { ...valid, id: "  " }, field: ".id" },
    { record: { ...valid, id: 42 }, field: ".id" },
    { record: { ...valid, title: null }, field: ".title" },
    { record: { ...valid, status: null }, field: ".status" },
    { record: { ...valid, status: "archived" }, field: ".status" },
    { record: { ...valid, description: {} }, field: ".description" },
    { record: { ...valid, priority: "2" }, field: ".priority" },
    { record: { ...valid, issue_type: [] }, field: ".issue_type" },
    { record: { ...valid, labels: "urgent" }, field: ".labels" },
    { record: { ...valid, labels: ["ok", null] }, field: ".labels[1]" },
    { record: { ...valid, dependencies: {} }, field: ".dependencies" },
    { record: { ...valid, dependencies: [null] }, field: ".dependencies[0]" },
    { record: { ...valid, dependencies: [{ title: "Missing ref" }] }, field: ".dependencies[0].id" },
    { record: { ...valid, dependencies: [{ depends_on_id: " " }] }, field: ".dependencies[0].depends_on_id" },
    { record: { ...valid, dependencies: [{ id: "dep", depends_on_id: null }] }, field: ".dependencies[0].depends_on_id" },
    { record: { ...valid, dependencies: [{ id: "dep", title: 1 }] }, field: ".dependencies[0].title" },
    { record: { ...valid, dependencies: [{ id: "dep", status: [] }] }, field: ".dependencies[0].status" },
    { record: { ...valid, dependencies: [{ id: "dep", dependency_type: false }] }, field: ".dependencies[0].dependency_type" },
    { record: { ...valid, dependencies: [{ depends_on_id: "dep", type: {} }] }, field: ".dependencies[0].type" },
  ];
  for (const field of ["assignee", "owner", "due", "due_at", "acceptance_criteria", "design", "notes", "created_at", "updated_at"]) {
    invalid.push({ record: { ...valid, [field]: false }, field: `.${field}` });
  }
  for (const field of ["dependency_count", "dependent_count", "comment_count"]) {
    invalid.push({ record: { ...valid, [field]: "1" }, field: `.${field}` });
  }

  for (const { record, field } of invalid) {
    for (const operation of ["list", "show", "create", "update", "claim"] as const) {
      const arrayResponse = json([valid, record]);
      const harness = makeHarness(operation === "list"
        ? [customTypes(""), arrayResponse, json([])]
        : [operation === "create" ? json(record) : arrayResponse]);
      const context = operation === "list" ? "list active" : operation === "create" ? "create" : `${operation} demo-1`;
      const path = `${operation === "create" ? "$" : "$[1]"}${field}`;
      const call = () => operation === "list" ? harness.adapter.list()
        : operation === "create" ? harness.adapter.create({ title: "Task" })
          : operation === "update" ? harness.adapter.update("demo-1", { title: "Updated" })
            : harness.adapter[operation]("demo-1");
      await assert.rejects(call, (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes(`Failed to parse bd output (${context}):`), error.message);
        assert.ok(error.message.includes(`at ${path}`), error.message);
        return true;
      });
      assert.equal(harness.calls.length, operation === "list" ? 2 : 1, "invalid responses must not trigger further commands");
    }
  }
});

test("blocked responses validate required collections and each nested blocker", async () => {
  const invalid: Array<{ record: unknown; field: string }> = [
    { record: null, field: "" },
    { record: { blocked_by: [] }, field: ".id" },
    { record: { id: "demo-1" }, field: ".blocked_by" },
    { record: { id: "demo-1", blocked_by: null }, field: ".blocked_by" },
    { record: { id: "demo-1", blocked_by: "dep" }, field: ".blocked_by" },
    { record: { id: "demo-1", blocked_by: ["dep", " "] }, field: ".blocked_by[1]" },
    { record: { id: "demo-1", blocked_by: [null] }, field: ".blocked_by[0]" },
    { record: { id: "demo-1", blocked_by: [42] }, field: ".blocked_by[0]" },
    { record: { id: "demo-1", blocked_by: [{}] }, field: ".blocked_by[0].id" },
    { record: { id: "demo-1", blocked_by: [{ id: "dep", title: 42 }] }, field: ".blocked_by[0].title" },
    { record: { id: "demo-1", blocked_by: [{ id: "dep", status: {} }] }, field: ".blocked_by[0].status" },
    { record: { id: "demo-1", blocked_by: [{ id: "dep", dependency_type: [] }] }, field: ".blocked_by[0].dependency_type" },
  ];
  for (const { record, field } of invalid) {
    const harness = makeHarness([customTypes(""), json([]), json([{ id: "valid", blocked_by: [] }, record])]);
    await assert.rejects(harness.adapter.list(), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.ok(error.message.includes("Failed to parse bd output (blocked active):"), error.message);
      assert.ok(error.message.includes(`at $[1]${field}`), error.message);
      return true;
    });
  }
});

test("optional null metadata and extra fields preserve sparse and rich valid records", async () => {
  const minimal = { id: "demo-1", title: "Task", status: "open" };
  const nullable: Record<string, unknown> = { ...minimal, future: { nested: true } };
  for (const field of [
    "description", "priority", "issue_type", "assignee", "owner", "labels", "dependencies",
    "due_at", "due", "acceptance_criteria", "design", "notes", "created_at", "updated_at",
    "dependency_count", "dependent_count", "comment_count",
  ]) nullable[field] = null;
  const sparse = await makeHarness([json([minimal])]).adapter.show("demo-1");
  assert.deepEqual(await makeHarness([json([nullable])]).adapter.show("demo-1"), sparse);

  const harness = makeHarness([
    json({ value: "research", extra: true }),
    json([{
      ...minimal,
      future: [1, 2],
      dependencies: [
        { depends_on_id: "list-dep", type: "blocks", future: true },
        { id: "show-dep", title: null, status: "closed", dependency_type: "related", future: true },
      ],
    }]),
    json([{
      id: "demo-1",
      blocked_by_count: "unused metadata is not validated",
      blocked_by: ["string-dep", { id: "object-dep", title: "Prerequisite", depends_on_id: "must-not-retarget" }],
    }]),
  ]);
  const [task] = await harness.adapter.list();
  assert.deepEqual(task?.dependencies, [
    { ref: "list-dep", dependencyType: "blocks" },
    { ref: "show-dep", title: undefined, status: "closed", dependencyType: "related" },
  ]);
  assert.deepEqual(task?.blockedBy, [
    { ref: "string-dep" },
    { ref: "object-dep", title: "Prerequisite", status: undefined, dependencyType: undefined },
  ]);
  assert.ok(harness.adapter.taskTypes.includes("research"));
});

test("config validates only its consumed value and stops before listing", async () => {
  for (const value of [undefined, null, 42, [], {}]) {
    const harness = makeHarness([json({ value })]);
    await assert.rejects(harness.adapter.list(), /Failed to parse bd output \(config types.custom\): expected string at \$\.value/);
    assert.equal(harness.calls.length, 1);
  }
});

test("invalid JSON and numeric overflow diagnostics do not echo response content", async () => {
  const secretLikeText = "payload-must-not-be-echoed";
  const syntax = makeHarness([{ stdout: `{"notes":"${secretLikeText}"` }]);
  await assert.rejects(syntax.adapter.show("demo-1"), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, "Failed to parse bd output (show demo-1): invalid JSON");
    assert.ok(!error.message.includes(secretLikeText));
    return true;
  });
  const overflow = makeHarness([{ stdout: '[{"id":"demo-1","title":"Task","status":"open","priority":1e999}]' }]);
  await assert.rejects(overflow.adapter.show("demo-1"), /expected finite number at \$\[0\]\.priority/);
  const unknownStatus = makeHarness([json([{ id: "demo-1", title: "Task", status: secretLikeText }])]);
  await assert.rejects(unknownStatus.adapter.show("demo-1"), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /Unsupported status from beads backend at \$\[0\]\.status/);
    assert.ok(!error.message.includes(secretLikeText));
    return true;
  });
});

test("invalid create metadata preserves validated identity without issuing more commands", async () => {
  const harness = makeHarness([json({ id: "created", title: "Saved title", status: "open", labels: "invalid" })]);
  await assert.rejects(harness.adapter.create({ title: "Requested", status: "blocked" }), (error: unknown) => {
    assert.ok(error instanceof PartialTaskCreateError);
    assert.equal(error.stage, "response");
    assert.equal(error.createdTask.ref, "created");
    assert.equal(error.createdTask.title, "Saved title");
    assert.equal(error.createdTask.status, "open");
    assert.equal(error.requestedStatus, "blocked");
    assert.match(error.message, /was created, but its response was invalid/);
    assert.match((error.cause as Error).message, /expected JSON array at \$\.labels/);
    return true;
  });
  assert.equal(harness.calls.length, 1);
});

test("unusable create identity warns about reported success without retrying", async () => {
  const harness = makeHarness([json({ title: "Task", status: "open" })]);
  await assert.rejects(harness.adapter.create({ title: "Task" }), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.ok(!(error instanceof PartialTaskCreateError));
    assert.match(error.message, /bd create reported success/);
    assert.match(error.message, /inspect the created task before retrying/);
    assert.match((error.cause as Error).message, /expected nonblank string at \$\.id/);
    return true;
  });
  assert.equal(harness.calls.length, 1);
});

test("response validation failures do not poison subsequent queued commands", async () => {
  const harness = makeHarness([
    json([{ id: "demo-1", status: "open" }]),
    json([{ id: "demo-2", title: "Valid", status: "open" }]),
  ]);
  const badUpdate = harness.adapter.update("demo-1", { title: "Changed" });
  const goodShow = harness.adapter.show("demo-2");
  await assert.rejects(badUpdate, /expected string at \$\[0\]\.title/);
  assert.equal((await goodShow).ref, "demo-2");
  assert.deepEqual(harness.calls.map(({ args }) => args[0]), ["update", "show"]);
});

test("invalid status-update responses retain existing partial-create recovery", async () => {
  const harness = makeHarness([
    json({ id: "created", title: "Task", status: "open" }),
    json([null]),
    json([{ id: "created", title: "Task", status: "blocked" }]),
  ]);
  await assert.rejects(harness.adapter.create({ title: "Task", status: "blocked" }), (error: unknown) => {
    assert.ok(error instanceof PartialTaskCreateError);
    assert.equal(error.stage, "status");
    assert.equal(error.createdTask.status, "blocked");
    assert.match(error.message, /Failed to parse bd output \(update created\)/);
    return true;
  });
  assert.deepEqual(harness.calls.map(({ args }) => args[0]), ["create", "update", "show"]);
});

test("show reports an empty result as not found", async () => {
  const harness = makeHarness([json([])]);
  await assert.rejects(harness.adapter.show("missing"), /Task not found: missing/);
});

test("command failures surface stderr and stop further work", async () => {
  const harness = makeHarness([
    customTypes(""),
    { code: 2, stderr: "database unavailable" },
    json([{ id: "unintended", title: "Should not run", status: "open" }]),
  ]);

  await assert.rejects(harness.adapter.list(), /database unavailable/);
  assert.deepEqual(harness.calls.map(({ args }) => args), [
    ["config", "get", "types.custom", "--json"],
    [
      "list",
      "--status",
      "open,in_progress,blocked",
      "--limit",
      "100",
      "--json",
    ],
  ]);
});
