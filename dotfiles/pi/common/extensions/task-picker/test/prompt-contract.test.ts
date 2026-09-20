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

test("execution prompts choose bounded work without skipping independent review", async () => {
  for (const name of ["execute-beads", "execute-gitlab-issue"] as const) {
    const text = await prompt(name, "target");
    assert.doesNotMatch(text, /Use triage and pi-subagents|context-builder/);
    for (const required of [
      "Use triage only when readiness or requirements remain unresolved",
      "verify whether the requested behavior already exists",
      "small, low-risk task with known files and checks",
      "the parent implements, then one independent reviewer reviews the resulting diff",
      "one scout only for plan-changing unknowns",
    ]) assert.ok(text.includes(required), `${name} missing bounded execution rule: ${required}`);
  }
});

test("native workers get fresh, self-contained handoffs with a justified fork escape hatch", async () => {
  for (const name of ["execute-beads", "execute-gitlab-issue"] as const) {
    const text = await prompt(name, "target");
    for (const required of [
      'Native workers explicitly use `context: "fresh"`',
      'Use `context: "fork"` only when essential decisions depend on parent history',
      "state that dependency before launch",
      "External runners keep their own contracts",
      "self-contained packet",
      "task and acceptance criteria",
      "repo/cwd/ref",
      "owned artifacts",
      "settled decisions",
      "validation commands/evidence",
      "stop/ask conditions",
    ]) assert.ok(text.includes(required), `${name} missing handoff rule: ${required}`);
  }
});

test("review follow-ups stay focused while preserving unresolved findings and regression checks", async () => {
  for (const name of ["execute-beads", "execute-gitlab-issue"] as const) {
    const text = await prompt(name, "target");
    for (const required of [
      "Re-review non-trivial fixes",
      "accepted fixes, unresolved findings, and regressions in the affected area",
      "widen only when new evidence warrants it",
      "Supply reviewers the approved criteria, exact diff or readable diff artifact, and validation evidence",
    ]) assert.ok(text.includes(required), `${name} missing review rule: ${required}`);
  }
});

test("clarifications are actionable and block approval until resolved", async () => {
  for (const name of ["execute-beads", "execute-gitlab-issue"] as const) {
    const text = await prompt(name, "target");
    for (const required of [
      "Questions before I can start",
      "at most three questions per round",
      "one decision per question",
      "remaining known blockers",
      "what you need and why",
      "evidence-backed choices",
      "help me decide",
      "simple reply format",
      "authorized read-only discovery",
      "Do not ask for execution approval while blockers remain",
      "Clarification answers are not execution approval",
      "With no blockers, go directly to",
      "Ready for approval",
      "non-blocking assumptions",
      "Pause if new blockers appear",
      "renewed approval for changed scope",
    ]) assert.ok(text.includes(required), `${name} missing clarification rule: ${required}`);
    assert.ok(text.indexOf("Questions before I can start") < text.indexOf("Ready for approval"));
    assert.ok(text.indexOf("Ready for approval") < text.indexOf("Execute this plan? yes/no/changes"));
    assert.doesNotMatch(text, /Ask necessary clarifications \(otherwise state none\), then exactly/);
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
