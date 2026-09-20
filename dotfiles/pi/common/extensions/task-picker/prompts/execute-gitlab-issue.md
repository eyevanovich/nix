---
description: Execute a GitLab issue with safe assignment, approval, review, and validation
argument-hint: "<host/project-path#iid-or-issue-url>"
---
<!-- task-picker:execute-gitlab-issue:v1 -->
Use pi-subagents for delegation. You own resolution, approval, integration, validation, review, and completion. Report decisions and evidence without narration or repetition. Never inspect, print, copy, or manage GitLab tokens.

## Resolve configuration and issue

Before mutation, read `~/.pi/agent/task-picker.json` with a file-reading tool. Require JSON `version: 1` and `gitlab.workStatus.mode` of `scoped-labels` or `none`; otherwise stop with an actionable diagnostic. Never guess a fallback.

- `scoped-labels`: require non-empty `inProgressLabel` and `deferredLabel`. Retain exact values; verify needed labels by exact name. Use these scoped labels for workflow status.
- `none`: no workflow-label value lookup/inference, status-label discovery/guards/mutations, or native-status probing. Hydrated ordinary labels remain read-only context.

Require exactly one canonical `host/group/project#iid` or issue URL. Retain exact host, project path, IID, and canonical `https://<host>/<group/project>` project URL. Before mutation, run `glab issue view <iid> --repo <project-url> --output json`; validate returned host/project/IID and inspect state, assignees, and labels. Every issue/label command uses this full URL. Resolve the target-host user with `glab api --hostname <host> user --output json`; parse `.username` without shell interpolation or token output.

In `scoped-labels`, paginate `glab label list --repo <project-url> --output json --per-page 100 --page <page>` from page 1 until fewer than 100 results. Stop if in-progress is absent. Missing deferred is allowed only if the issue does not use it. Never create, rename, substitute, or guess labels.

## Guard and start

Clear every applicable guard before reopening, assignment, or status mutation:

- Closed issue: ask before reopening.
- Any existing assignees other than the resolved user: show exact non-secret evidence; ask before additive self-assignment and retain existing assignees.
- `scoped-labels` deferred issue: ask exactly `This issue is deferred (<deferred-label>). Starting it will replace <deferred-label> with <in-progress-label>. Continue?` using exact resolved names.

No/cancellation: no mutation or comment. After approval, reopen first if approved; assign additively with `glab issue update <iid> --repo <project-url> --assignee +<username>`. In `scoped-labels`, run `glab issue update <iid> --repo <project-url> --label <in-progress-label>`; rely on scoped replacement, never manually remove status labels. In `none`, perform no workflow-status mutation. Rehydrate after mutations; report exact persisted state on partial failure.

## Plan and approve

Use triage only when readiness or requirements remain unresolved; otherwise use the existing brief and settled decisions. Always retain the tracker guards above and verify whether the requested behavior already exists. Consult relevant domain docs/ADRs and prior rejection notes when applicable; ask before overriding a prior rejection.

Choose the smallest execution shape: for a small, low-risk task with known files and checks, the parent implements, then one independent reviewer reviews the resulting diff. Delegate substantial work to a bounded writer. Discovery is optional, fresh-context, read-only: use one scout only for plan-changing unknowns, a researcher only for material current external facts.

Before delegation, call `subagent({ action: "list", capabilities: true })`; use executable, non-disabled agents (external runners also require `runner.available === true`). Never abandon live runs.

Preserve issue scope; ask before product/API/architecture/scope/dependency changes. Use plain language; explain necessary jargon. If blocked, start **Questions before I can start**: ask at most three questions per round, one decision per question; note remaining known blockers. Say what you need and why; offer evidence-backed choices/recommendations when available, plus “help me decide”. Give a simple reply format, e.g. `1: A; 2: ...`. Uncertainty calls for bounded, authorized read-only discovery, not guessing or requesting secrets. Do not ask for execution approval while blockers remain.

Clarification answers are not execution approval. With no blockers, go directly to **Ready for approval**: briefly state the outcome, files/artifacts likely to change, non-goals, success checks/user flows/evidence, execution roles, risks, and non-blocking assumptions. Put short evidence references last; offer detailed logs on request. Then ask exactly: `Execute this plan? yes/no/changes`. Implementation requires approval. Pause if new blockers appear; seek renewed approval for changed scope.

After approval, resolve the exact default branch from authoritative remote metadata. Switch to a descriptive task branch if on default; otherwise retain the current branch. Never make task changes directly on the default branch.

## Implement

Native workers explicitly use `context: "fresh"`. Use `context: "fork"` only when essential decisions depend on parent history; state that dependency before launch. External runners keep their own contracts; omit unsupported native context options.

Use one active-worktree writer for coupled work, a dirty tree, or overlapping files. Parallel writers require a clean repository, isolated worktrees, and disjoint ownership. Each child receives a compact, self-contained packet: task and acceptance criteria, repo/cwd/ref, owned artifacts, settled decisions, named references, constraints/non-goals, validation commands/evidence, output shape, and stop/ask conditions. Include needed issue content, not just a link. Limit discovery to these resources, immediate dependencies, and nearest validation artifacts; ask before widening. Workers stay within that contract; staging, commits, and publishing belong to the parent/delivery workflow.

Inspect every result and integrated diff. If blocked after starting, leave at most one concise issue note with useful non-secret evidence.

## Validate and review

Run focused validation in the active worktree and at least one fresh-context, read-only independent review after implementation; add specialist reviews only for material risks. Supply reviewers the approved criteria, exact diff or readable diff artifact, and validation evidence. Classify findings: blocker, fixes-now, optional-defer, ignore. Fix blockers/fixes-now. Re-review non-trivial fixes: accepted fixes, unresolved findings, and regressions in the affected area; widen only when new evidence warrants it.

Completion gate: approved outcome implemented, every acceptance criterion evidenced by commands/user flows, integrated diff checked, final validation passed, and required review findings resolved. Only then create exactly one task-scoped completion commit, preserving unrelated work. Record branch and SHA.

## Deliver

Retain custody. Do not push or create/update an MR; MR creation and integration are explicit later actions. Once the completion gate passes and the task-scoped completion commit exists, continue directly to Finish.

## Finish

Close only when the completion gate passes and the approved outcome is committed: `glab issue close <iid> --repo <project-url>`. Native close completes both modes; set no completion label/status. Rehydrate with the full URL to verify closed state; otherwise leave open and report remaining work.

Final answer: exact issue, outcome/artifacts, validation/checks, review, branch/SHA, deferred items, risks, and final GitLab state.

<target>
$ARGUMENTS
</target>
