import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expandBundledExecutionPrompt } from "../lib/execution-prompt.ts";
import { isolatedWorkerInstructions } from "../work-runner/worker-instructions.ts";

const promptsDir = fileURLToPath(new URL("../prompts", import.meta.url));

async function prompt(name: "execute-beads" | "execute-gitlab-issue", target: string) {
  return expandBundledExecutionPrompt(`/${name} ${target}`, promptsDir);
}

test("execution prompts keep dynamic targets at the cache-friendly tail", async () => {
  for (const [name, target] of [
    ["execute-beads", "bd-42"],
    ["execute-gitlab-issue", "https://gitlab.example/group/project/-/issues/42"],
  ] as const) {
    const expanded = await prompt(name, target);
    assert.equal(expanded.includes("$ARGUMENTS"), false);
    assert.ok(expanded.lastIndexOf("<target>") > expanded.indexOf("## Finish"));
    assert.ok(expanded.endsWith(`<target>\n${target}\n</target>`));
  }
});

test("Beads prompt preserves approval, execution, review, and completion contracts", async () => {
  const text = await prompt("execute-beads", "bd-42");
  for (const required of [
    "Execute this plan? yes/no/changes",
    "Never make task changes directly on the default branch",
    "one active-worktree writer",
    "fresh-context, read-only",
    "independent review",
    "exactly one task-scoped completion commit",
    "Direct completion",
    "do not push or create an MR",
    "if authorized, merge with squash and delete the source branch",
    "bd close <id> --reason=\"Completed\"",
  ]) assert.match(text, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
});

test("GitLab prompt preserves canonical resolution, mutation guards, modes, and closure", async () => {
  const text = await prompt(
    "execute-gitlab-issue",
    "https://gitlab.example/group/project/-/issues/42"
  );
  for (const required of [
    "version: 1",
    "scoped-labels",
    "none",
    "canonical `https://<host>/<group/project>` project URL",
    "--assignee +<username>",
    "Any existing assignees other than the resolved user",
    "glab issue update <iid> --repo <project-url> --label <in-progress-label>",
    "This issue is deferred (<deferred-label>). Starting it will replace <deferred-label> with <in-progress-label>. Continue?",
    "Execute this plan? yes/no/changes",
    "Never make task changes directly on the default branch",
    "independent review",
    "exactly one task-scoped completion commit",
    "if authorized, merge with squash and delete the source branch",
    "glab issue close <iid> --repo <project-url>",
  ]) assert.ok(text.includes(required), `missing GitLab contract: ${required}`);
});

test("isolated policy contains only the retained-worktree delivery override contracts", () => {
  const text = isolatedWorkerInstructions();
  for (const required of [
    "existing task-picker/* branch",
    "direct completion",
    "verified tracker closure",
    "awaiting-decision",
    "ready-for-review",
    "no-mistakes checks-passed",
    "do not run Finish or close the tracker",
    "Never return the Treehouse lease",
  ]) assert.ok(text.includes(required), `missing isolated contract: ${required}`);
});

test("prompt context stays within explicit size budgets", async () => {
  const beadsSource = await readFile(new URL("../prompts/execute-beads.md", import.meta.url), "utf8");
  const gitlabSource = await readFile(
    new URL("../prompts/execute-gitlab-issue.md", import.meta.url),
    "utf8"
  );
  const worker = isolatedWorkerInstructions();

  assert.ok(beadsSource.length < 8_000, `Beads prompt is ${beadsSource.length} characters`);
  assert.ok(gitlabSource.length < 9_000, `GitLab prompt is ${gitlabSource.length} characters`);
  assert.ok(worker.length < 2_000, `isolated policy is ${worker.length} characters`);
  assert.ok(
    Math.max(beadsSource.length, gitlabSource.length) + worker.length < 10_500,
    "combined isolated-run instructions exceed 10,500 characters"
  );
});
