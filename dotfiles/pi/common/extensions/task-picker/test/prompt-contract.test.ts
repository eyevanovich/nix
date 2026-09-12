import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expandBundledExecutionPrompt } from "../lib/execution-prompt.ts";

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
    "Retain custody",
    "do not push or create an MR",
    "continue directly to Finish",
    "bd close <id> --reason=\"Completed\"",
    "Close each committed target satisfying the completion gate",
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
    "Require exactly one canonical",
    "canonical `https://<host>/<group/project>` project URL",
    "--assignee +<username>",
    "Any existing assignees other than the resolved user",
    "glab issue update <iid> --repo <project-url> --label <in-progress-label>",
    "This issue is deferred (<deferred-label>). Starting it will replace <deferred-label> with <in-progress-label>. Continue?",
    "Execute this plan? yes/no/changes",
    "Never make task changes directly on the default branch",
    "independent review",
    "exactly one task-scoped completion commit",
    "Retain custody",
    "Do not push or create/update an MR",
    "continue directly to Finish",
    "glab issue close <iid> --repo <project-url>",
  ]) assert.ok(text.includes(required), `missing GitLab contract: ${required}`);
});

test("execution prompts retain explicit delegation and completion gates", async () => {
  for (const name of ["execute-beads", "execute-gitlab-issue"] as const) {
    const text = await prompt(name, "target");
    for (const required of [
      'subagent({ action: "list", capabilities: true })',
      "runner.available === true",
      "Implementation requires approval",
      "Retain custody",
      "continue directly to Finish",
      "Completion gate:",
      "every acceptance criterion evidenced",
      "final validation passed",
      "required review findings resolved",
      "Only then create exactly one task-scoped completion commit",
    ]) assert.ok(text.includes(required), `${name} missing gate: ${required}`);
    assert.match(text.slice(text.indexOf("## Finish")), /completion gate/);
  }
});

test("prompt context stays within explicit size budgets", async () => {
  const beadsSource = await readFile(new URL("../prompts/execute-beads.md", import.meta.url), "utf8");
  const gitlabSource = await readFile(
    new URL("../prompts/execute-gitlab-issue.md", import.meta.url),
    "utf8"
  );
  assert.ok(beadsSource.length < 6_600, `Beads prompt is ${beadsSource.length} characters`);
  assert.ok(gitlabSource.length < 8_200, `GitLab prompt is ${gitlabSource.length} characters`);
});
