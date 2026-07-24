import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createGitLabBackend, type GitLabProjectIdentity } from "../backend/adapters/gitlab.ts";
import { PartialTaskCreateError } from "../backend/api.ts";
import { createGitLabProvider } from "../backend/providers/gitlab.ts";
import { createTaskSaveSession } from "../extension.ts";
import { buildTaskContext } from "../lib/task-context.ts";
import { buildTaskListTextParts } from "../models/task.ts";

interface Call {
  command: string;
  args: string[];
  options: unknown;
}

const project: GitLabProjectIdentity = {
  root: "/repo",
  host: "gitlab.example.com",
  path: "group/project",
  canonicalId: "gitlab.example.com/group/project",
  webUrl: "https://gitlab.example.com/group/project",
  numericId: 42,
};

function fixture(name: "project" | "issue"): string {
  return readFileSync(new URL(`./fixtures/glab-1.108/${name}.json`, import.meta.url), "utf8");
}

function issue(iid: number, overrides: Record<string, unknown> = {}) {
  return {
    id: 1000 + iid,
    iid,
    title: `Issue ${iid}`,
    description: `Description ${iid}`,
    state: "opened",
    labels: ["backend", { title: "workflow::ready" }],
    assignees: [{ username: "ivan" }],
    milestone: { title: "MVP" },
    weight: 3,
    due_date: "2026-08-01",
    web_url: `https://gitlab.example.com/group/project/-/issues/${iid}`,
    issue_type: "issue",
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-02T00:00:00Z",
    ...overrides,
  };
}

function fakePi(handler: (call: Call) => { code: number; stdout?: string; stderr?: string }) {
  const calls: Call[] = [];
  const pi = {
    async exec(command: string, args: string[], options: unknown) {
      const call = { command, args, options };
      calls.push(call);
      return { stdout: "", stderr: "", ...handler(call) };
    },
  } as unknown as ExtensionAPI;
  return { pi, calls };
}

function providerPi(responses: Array<{ code: number; stdout?: string; stderr?: string }>) {
  let index = 0;
  return fakePi(() => responses[index++] ?? { code: 1, stderr: "unexpected call" });
}

test("GitLab provider resolves nested cwd to canonical host/project identity", async () => {
  const harness = providerPi([
    { code: 0, stdout: "glab 1.108.0" },
    { code: 0, stdout: "authenticated" },
    {
      code: 0,
      stdout: fixture("project"),
    },
  ]);
  const provider = createGitLabProvider(harness.pi, ["/prompts"], {
    resolveGitRoot: (cwd) => {
      assert.equal(cwd, "/repo/nested");
      return { status: 0, stdout: "/repo\n" };
    },
  });

  assert.deepEqual(await provider.detect("/repo/nested"), {
    kind: "ready",
    repository: { root: "/repo", canonicalId: "gitlab.example.com/group/project" },
  });
  assert.deepEqual(
    harness.calls.map(({ command, args, options }) => ({ command, args, options })),
    [
      { command: "glab", args: ["version"], options: { cwd: "/repo", timeout: 30_000 } },
      { command: "glab", args: ["auth", "status"], options: { cwd: "/repo", timeout: 30_000 } },
      { command: "glab", args: ["repo", "view", "--output", "json"], options: { cwd: "/repo", timeout: 30_000 } },
    ]
  );
});

test("GitLab provider classifies missing CLI, non-GitLab, auth, permission, network, and malformed JSON", async () => {
  const dependency = { resolveGitRoot: () => ({ status: 0, stdout: "/repo" }) };
  const scenarios = [
    {
      responses: [{ code: 1, stderr: "spawn glab ENOENT" }],
      expected: /CLI is unavailable.*ENOENT/i,
    },
    {
      responses: [
        { code: 0 },
        { code: 0 },
        { code: 1, stderr: "not a GitLab repository" },
      ],
      kind: "not-applicable",
      expected: /No GitLab project/i,
    },
    {
      responses: [{ code: 0 }, { code: 1, stderr: "not authenticated" }],
      expected: /authentication failed/i,
    },
    {
      responses: [{ code: 0 }, { code: 0 }, { code: 1, stderr: "403 Forbidden" }],
      expected: /access was denied/i,
    },
    {
      responses: [{ code: 0 }, { code: 0 }, { code: 1, stderr: "network timeout" }],
      expected: /network error/i,
    },
    {
      responses: [{ code: 0 }, { code: 0 }, { code: 0, stdout: "not-json" }],
      expected: /malformed JSON/i,
    },
  ];

  for (const scenario of scenarios) {
    const harness = providerPi(scenario.responses);
    const detection = await createGitLabProvider(harness.pi, [], dependency).detect("/repo");
    assert.equal(detection.kind, scenario.kind ?? "unavailable");
    assert.match(detection.kind === "ready" ? "" : detection.message, scenario.expected);
  }
});

test("GitLab provider reports non-Git directories without invoking glab", async () => {
  const harness = providerPi([]);
  const detection = await createGitLabProvider(harness.pi, [], {
    resolveGitRoot: () => ({ status: 128, stderr: "not a git repository" }),
  }).detect("/tmp");
  assert.equal(detection.kind, "not-applicable");
  assert.deepEqual(harness.calls, []);
});

test("GitLab list uses the documented open default and paginates beyond 30", async () => {
  const firstPage = Array.from({ length: 100 }, (_, index) => issue(index + 1));
  const secondPage = [issue(101)];
  const harness = fakePi(({ args }) => {
    const page = args[args.indexOf("--page") + 1];
    return { code: 0, stdout: JSON.stringify(page === "1" ? firstPage : secondPage) };
  });

  const tasks = await createGitLabBackend(harness.pi, project).list();

  assert.equal(tasks.length, 101);
  assert.deepEqual(harness.calls.map(({ args }) => args), [
    ["issue", "list", "--output", "json", "--page", "1", "--per-page", "100", "--repo", project.webUrl],
    ["issue", "list", "--output", "json", "--page", "2", "--per-page", "100", "--repo", project.webUrl],
  ]);
  assert.ok(harness.calls.every(({ args }) => !args.includes("--all") && !args.includes("--closed")));
  assert.equal(tasks[100]?.ref, "gitlab.example.com/group/project#101");
});

test("GitLab show normalizes common fields and read-only metadata", async () => {
  const harness = fakePi(() => ({ code: 0, stdout: fixture("issue") }));
  const task = await createGitLabBackend(harness.pi, project).show("gitlab.example.com/group/project#7");

  assert.equal(task.id, "#7");
  assert.equal(task.status, "open");
  assert.equal(task.priority, undefined);
  assert.equal(task.taskType, undefined);
  assert.deepEqual(task.labels, ["backend", "workflow::ready"]);
  assert.equal(task.assignee, "ivan");
  assert.deepEqual(task.gitlab, {
    project: "gitlab.example.com/group/project",
    iid: 7,
    webUrl: "https://gitlab.example.com/group/project/-/issues/7",
    assignees: ["ivan"],
    milestone: "MVP",
    weight: 3,
    issueType: "issue",
  });
  assert.deepEqual(harness.calls[0]?.args, ["issue", "view", "7", "--output", "json", "--repo", project.webUrl]);
  assert.deepEqual(harness.calls[0]?.options, { cwd: "/repo", timeout: 30_000 });
  assert.equal(buildTaskListTextParts(task).meta, "○");
  assert.deepEqual(
    buildTaskContext(task).slice(-5).map(({ label, value }) => [label, value]),
    [
      ["Project", "gitlab.example.com/group/project"],
      ["Web URL", "https://gitlab.example.com/group/project/-/issues/7"],
      ["Milestone", "MVP"],
      ["Weight", "3"],
      ["Issue type", "issue"],
    ]
  );
});

test("GitLab create uses stable API JSON and hydrates the created issue", async () => {
  const harness = fakePi(() => ({ code: 0, stdout: JSON.stringify(issue(8)) }));
  const task = await createGitLabBackend(harness.pi, project).actions.create?.({
    title: "A title; $(safe)",
    description: "line one\nline two",
  });

  assert.equal(task?.ref, "gitlab.example.com/group/project#8");
  assert.deepEqual(harness.calls.map(({ args }) => args), [
    ["api", "projects/:fullpath/issues", "--hostname", project.host, "--method", "POST", "--raw-field", "title=A title; $(safe)", "--raw-field", "description=line one\nline two", "--output", "json"],
    ["issue", "view", "8", "--output", "json", "--repo", project.webUrl],
  ]);
});

test("GitLab create pins the self-managed host and project-root cwd", async () => {
  const selfManaged = { ...project, host: "git.internal.example:8443", webUrl: undefined };
  const harness = fakePi(() => ({ code: 0, stdout: JSON.stringify(issue(17)) }));

  await createGitLabBackend(harness.pi, selfManaged).actions.create?.({
    title: "Self-managed issue",
    description: "Body",
  });

  assert.deepEqual(harness.calls[0], {
    command: "glab",
    args: [
      "api",
      "projects/:fullpath/issues",
      "--hostname",
      "git.internal.example:8443",
      "--method",
      "POST",
      "--raw-field",
      "title=Self-managed issue",
      "--raw-field",
      "description=Body",
      "--output",
      "json",
    ],
    options: { cwd: "/repo", timeout: 30_000 },
  });
});

test("GitLab create applies an explicitly requested closed state after creation", async () => {
  const harness = fakePi(() => ({ code: 0, stdout: JSON.stringify(issue(11, { state: "closed" })) }));
  await createGitLabBackend(harness.pi, project).actions.create?.({
    title: "Closed on creation",
    status: "closed",
  });

  assert.deepEqual(harness.calls.map(({ args }) => args), [
    ["api", "projects/:fullpath/issues", "--hostname", project.host, "--method", "POST", "--raw-field", "title=Closed on creation", "--raw-field", "description=", "--output", "json"],
    ["issue", "close", "11", "--repo", project.webUrl],
    ["issue", "view", "11", "--output", "json", "--repo", project.webUrl],
  ]);
});

test("partial GitLab create recovery retries state without creating a duplicate issue", async () => {
  let call = 0;
  const harness = fakePi(() => {
    call += 1;
    if (call === 1) return { code: 0, stdout: JSON.stringify(issue(14)) };
    if (call === 2) return { code: 1, stderr: "close denied" };
    if (call === 3) {
      return { code: 0, stdout: JSON.stringify(issue(14, { title: "Persisted title" })) };
    }
    if (call === 4) return { code: 0, stdout: "closed" };
    return { code: 0, stdout: JSON.stringify(issue(14, { title: "Persisted title", state: "closed" })) };
  });
  const actions = createGitLabBackend(harness.pi, project).actions;
  const session = createTaskSaveSession({
    create: actions.create!,
    update: actions.update!,
  });
  const draft = {
    title: "Persisted title",
    description: "Description 14",
    status: "closed" as const,
    priority: undefined,
    taskType: undefined,
  };

  await assert.rejects(session.save(draft), (error) => {
    assert.ok(error instanceof PartialTaskCreateError);
    assert.equal(error.createdTask.title, "Persisted title");
    assert.equal(error.createdTask.status, "open");
    return true;
  });
  assert.equal(await session.save(draft), true);
  assert.equal(harness.calls.filter(({ args }) => args[0] === "api").length, 1);
  assert.deepEqual(harness.calls.map(({ args }) => args.slice(0, 2)), [
    ["api", "projects/:fullpath/issues"],
    ["issue", "close"],
    ["issue", "view"],
    ["issue", "close"],
    ["issue", "view"],
  ]);
});

test("create session recovers a GitLab refresh failure without a second API create", async () => {
  let call = 0;
  const harness = fakePi(() => {
    call += 1;
    if (call === 1) return { code: 0, stdout: JSON.stringify(issue(15)) };
    if (call === 2) return { code: 1, stderr: "refresh denied" };
    if (call === 3) return { code: 0, stdout: "updated" };
    return { code: 0, stdout: JSON.stringify(issue(15, { title: "Recovered title" })) };
  });
  const actions = createGitLabBackend(harness.pi, project).actions;
  const session = createTaskSaveSession({
    create: actions.create!,
    update: actions.update!,
  });
  const initialDraft = {
    title: "Issue 15",
    description: "Description 15",
    status: "open" as const,
    priority: undefined,
    taskType: undefined,
  };

  await assert.rejects(session.save(initialDraft), (error) => {
    assert.ok(error instanceof PartialTaskCreateError);
    assert.equal(error.stage, "refresh");
    assert.equal(error.createdTask.ref, "gitlab.example.com/group/project#15");
    assert.match(error.message, /created, but refreshing it failed.*refresh denied/);
    return true;
  });
  assert.equal(session.createdTask?.ref, "gitlab.example.com/group/project#15");
  assert.equal(await session.save({ ...initialDraft, title: "Recovered title" }), true);
  assert.equal(harness.calls.filter(({ args }) => args[0] === "api").length, 1);
  assert.deepEqual(harness.calls.map(({ args }) => args.slice(0, 3)), [
    ["api", "projects/:fullpath/issues", "--hostname"],
    ["issue", "view", "15"],
    ["issue", "update", "15"],
    ["issue", "view", "15"],
  ]);
});

test("GitLab edit, close, and reopen use exact argv and hydrate pessimistically", async () => {
  const harness = fakePi(() => ({ code: 0, stdout: JSON.stringify(issue(9)) }));
  const backend = createGitLabBackend(harness.pi, project);

  await backend.actions.update?.(backend.id + "/project#9", { title: "Updated", description: "Body" });
  await backend.actions.changeStatus?.("9", "closed");
  await backend.actions.changeStatus?.("9", "open");

  assert.deepEqual(harness.calls.map(({ args }) => args), [
    ["issue", "update", "9", "--title", "Updated", "--description", "Body", "--repo", project.webUrl],
    ["issue", "view", "9", "--output", "json", "--repo", project.webUrl],
    ["issue", "close", "9", "--repo", project.webUrl],
    ["issue", "view", "9", "--output", "json", "--repo", project.webUrl],
    ["issue", "reopen", "9", "--repo", project.webUrl],
    ["issue", "view", "9", "--output", "json", "--repo", project.webUrl],
  ]);
  assert.deepEqual(
    harness.calls.map(({ options }) => options),
    Array.from({ length: 6 }, () => ({ cwd: "/repo", timeout: 30_000 }))
  );
});

test("GitLab reports partial success when fields update but state mutation fails", async () => {
  let calls = 0;
  const harness = fakePi(() => {
    calls += 1;
    return calls === 1
      ? { code: 0, stdout: "updated" }
      : { code: 1, stderr: "permission denied" };
  });

  await assert.rejects(
    createGitLabBackend(harness.pi, project).actions.update!("10", {
      title: "Persisted title",
      status: "closed",
    }),
    /fields were updated, but changing state failed.*permission denied/
  );
});

test("GitLab malformed issue JSON includes command context", async () => {
  const harness = fakePi(() => ({ code: 0, stdout: "{" }));
  await assert.rejects(
    createGitLabBackend(harness.pi, project).show("1"),
    /Malformed JSON from glab issue view 1/
  );
});

test("GitLab repository selector preserves a self-managed host without project web_url", async () => {
  const fallbackProject = { ...project, host: "git.internal.example:8443", webUrl: undefined };
  const harness = fakePi(() => ({ code: 0, stdout: JSON.stringify(issue(16)) }));

  await createGitLabBackend(harness.pi, fallbackProject).show("16");

  assert.deepEqual(harness.calls[0], {
    command: "glab",
    args: [
      "issue",
      "view",
      "16",
      "--output",
      "json",
      "--repo",
      "https://git.internal.example:8443/group/project",
    ],
    options: { cwd: "/repo", timeout: 30_000 },
  });
});

test("profile task-picker configs select scoped labels only for personal", () => {
  const personal = JSON.parse(
    readFileSync(new URL("../../../../personal/task-picker.json", import.meta.url), "utf8")
  );
  const work = JSON.parse(
    readFileSync(new URL("../../../../work/task-picker.json", import.meta.url), "utf8")
  );

  assert.deepEqual(personal, {
    version: 1,
    gitlab: {
      workStatus: {
        mode: "scoped-labels",
        inProgressLabel: "status::in-progress",
        deferredLabel: "status::deferred",
        readyForReviewLabel: "status::ready-for-review",
      },
    },
  });
  assert.deepEqual(work, {
    version: 1,
    gitlab: { workStatus: { mode: "none" } },
  });
});

test("bundled execution workflows require merge request delivery", () => {
  for (const name of ["execute-beads.md", "execute-gitlab-issue.md"]) {
    const prompt = readFileSync(new URL(`../prompts/${name}`, import.meta.url), "utf8");

    assert.match(prompt, /working branch into the repository's exact default branch/);
    assert.match(prompt, /entire MR title must be lowercase/);
    assert.match(prompt, /`fix:` for a patch/);
    assert.match(prompt, /`feat:` for a minor/);
    assert.match(prompt, /`feat!:` for a major breaking change/);
    assert.match(prompt, /optional lowercase Conventional Commit scope is allowed/);
    assert.match(prompt, /`fix\(pi\):`, `feat\(pi\):`, or `feat\(pi\)!:`/);
    assert.match(prompt, /squash merging enabled/);
    assert.match(prompt, /source-branch deletion enabled/);
    assert.match(prompt, /trusted default branch resolved from authoritative remote metadata/);
    assert.match(prompt, /Before any delivery commit, push, or MR mutation, check whether no-mistakes is runnable/);
    assert.match(prompt, /`no-mistakes axi run --help`/);
    assert.match(prompt, /`no-mistakes axi respond --help`/);
    assert.match(
      prompt,
      /injected `\[TASK PICKER ISOLATED RUN\]` policy guarantees tool capability, but it does not remove the bootstrap-commit requirement/
    );
    assert.match(prompt, /create exactly one task-scoped bootstrap commit/i);
    assert.match(prompt, /requires committed HEAD and a clean working tree/);
    assert.match(prompt, /does not imply support for uncommitted work/);
    assert.match(prompt, /Custody transfers only after `no-mistakes axi run` accepts/);
    assert.match(
      prompt,
      /No-mistakes then owns rebase, review fixes, subsequent commits, push, MR creation or update, every MR metadata or settings correction, and CI/
    );
    assert.doesNotMatch(prompt, /leave the validated task-scoped work for no-mistakes to commit/);
    assert.match(prompt, /When the capability check fails, or a clean handoff cannot be produced/);
    assert.doesNotMatch(prompt, /trusted main/);
  }
});

test("GitLab execution workflow resolves profile status behavior before mutation", () => {
  const prompt = readFileSync(
    new URL("../prompts/execute-gitlab-issue.md", import.meta.url),
    "utf8"
  );
  const guardHeading = prompt.indexOf("## Clear all pre-mutation guards");
  const mutationHeading = prompt.indexOf("## Apply start mutations");
  const firstMutation = prompt.indexOf("glab issue update <iid>");

  assert.match(prompt, /read `~\/\.pi\/agent\/task-picker\.json` with a file-reading tool, not shell output/);
  assert.match(prompt, /accept only `version: 1`/);
  assert.match(prompt, /`scoped-labels` or `none`/);
  assert.match(prompt, /missing, malformed, or unsupported configuration must stop/);
  assert.match(prompt, /glab api --hostname <host> user --output json/);
  assert.match(
    prompt,
    /glab label list --repo <project-url> --output json --per-page 100 --page <page>/
  );
  assert.match(prompt, /Verify the configured labels by exact name/);
  assert.match(prompt, /also require a non-empty `readyForReviewLabel`/);
  assert.match(prompt, /stop before assignment or status mutation if `<ready-for-review-label>` is absent/);
  assert.match(prompt, /git ls-remote --exit-code origin HEAD/);
  assert.match(prompt, /run `no-mistakes rerun`/);
  assert.match(prompt, /keep the issue open/);
  assert.match(prompt, /--label <ready-for-review-label>/);
  assert.match(prompt, /phase `ready-for-review`/);
  assert.match(
    prompt,
    /This issue is deferred \(<deferred-label>\)\. Starting it will replace <deferred-label> with <in-progress-label>\. Continue\?/
  );
  assert.match(prompt, /glab issue update <iid> --repo <project-url> --assignee \+<username>/);
  assert.match(
    prompt,
    /glab issue update <iid> --repo <project-url> --label <in-progress-label>/
  );
  assert.match(
    prompt,
    /For `none`, do not read or infer configured work-status label values, list project labels for status discovery, use labels as workflow-status guards, mutate status, or probe enterprise native status/
  );
  assert.match(
    prompt,
    /Normal issue hydration may include ordinary labels as read-only issue context\. In `none` mode, those labels must not drive work-status behavior/
  );
  assert.match(
    prompt,
    /In `none` mode, skip project-label listing for status discovery, every label-based workflow guard, and every status mutation/
  );
  assert.match(prompt, /Ordinary labels from issue hydration remain read-only context only/);
  assert.match(prompt, /Only in `scoped-labels` mode, list all existing project labels/);
  assert.match(prompt, /Only in `scoped-labels` mode, if the issue currently has `<deferred-label>`/);
  assert.match(prompt, /glab issue close <iid> --repo <project-url>/);
  assert.match(prompt, /never fall back to an unqualified project path/);
  assert.match(prompt, /Never inspect, print, copy, or manage GitLab tokens/);
  assert.doesNotMatch(prompt, /status::in-progress|status::deferred|status::done/);
  assert.doesNotMatch(prompt, /graphql|workItemUpdate|glab work-items/i);

  assert.ok(guardHeading > prompt.indexOf("task-picker.json"));
  assert.ok(mutationHeading > guardHeading);
  assert.ok(mutationHeading > prompt.indexOf("If the issue is closed"));
  assert.ok(mutationHeading > prompt.indexOf("If another user owns it"));
  assert.ok(firstMutation > mutationHeading);
});

test("GitLab execution request uses the canonical issue URL on the exact host", async () => {
  const backend = createGitLabBackend({} as ExtensionAPI, project);
  assert.deepEqual(
    await backend.actions.startWork({
      ref: "gitlab.example.com/group/project#12",
      title: "Issue",
      status: "open",
      gitlab: {
        project: project.canonicalId,
        iid: 12,
        webUrl: "https://gitlab.example.com/group/project/-/issues/12",
      },
    }),
    { prompt: "/execute-gitlab-issue https://gitlab.example.com/group/project/-/issues/12" }
  );

  const fallbackProject = { ...project, host: "git.internal.example:8443", webUrl: undefined };
  assert.deepEqual(
    await createGitLabBackend({} as ExtensionAPI, fallbackProject).actions.startWork({
      ref: "git.internal.example:8443/group/project#13",
      title: "Issue",
      status: "open",
    }),
    { prompt: "/execute-gitlab-issue https://git.internal.example:8443/group/project/-/issues/13" }
  );
});
