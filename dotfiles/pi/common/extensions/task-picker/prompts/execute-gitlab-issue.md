---
description: Execute a GitLab issue with safe assignment, approval, review, and validation
argument-hint: "<host/project-path#iid-or-issue-url>"
---
Use triage and pi-subagents. You own resolution, approval, integration, validation, review, and completion; delegate bounded discovery, implementation, or independent review. Report decisions and evidence without narration or repetition. Never inspect, print, copy, or manage GitLab tokens.

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

Before delegation, call `subagent({ action: "list", capabilities: true })`; use executable, non-disabled agents (external runners also require `runner.available === true`). Discovery is optional, fresh-context, read-only, bounded to the issue, named artifacts, immediate dependencies, and plan-changing evidence. Prefer one `context-builder` or `scout`; use a researcher only for material current external facts. Never abandon live runs.

Present outcome/non-goals, likely artifacts, done-when behavior, focused validation/user flows, required evidence, risks/open decisions, execution shape, and bounded roles. Preserve issue scope; ask before product/API/architecture/scope/dependency changes. Ask necessary clarifications (otherwise state none), then exactly: `Execute this plan? yes/no/changes`. Implementation requires approval.

After approval, resolve the exact default branch from authoritative remote metadata. Switch to a descriptive task branch if on default; otherwise retain the current branch. Never make task changes directly on the default branch.

## Implement

Use one active-worktree writer for coupled work, a dirty tree, or overlapping files. Parallel writers require a clean repository, isolated worktrees, and disjoint ownership. Give workers approved scope, owned artifacts, named references, non-goals, done-when behavior, validation/evidence, and decision stops. Workers stay within that contract; staging, commits, and publishing belong to the parent/delivery workflow.

Inspect every result and integrated diff. If blocked after starting, leave at most one concise issue note with useful non-secret evidence.

## Validate and review

Run focused validation in the active worktree and at least one fresh-context, read-only independent review. Classify findings: blocker, fixes-now, optional-defer, ignore. Fix blockers/fixes-now; re-review non-trivial fixes.

Completion gate: approved outcome implemented, every acceptance criterion evidenced by commands/user flows, integrated diff checked, final validation passed, and required review findings resolved. Only then create exactly one task-scoped completion commit, preserving unrelated work. Record branch and SHA.

## Deliver

Retain custody. Do not push or create/update an MR; MR creation and integration are explicit later actions. Once the completion gate passes and the task-scoped completion commit exists, continue directly to Finish.

## Finish

Close only when the completion gate passes and the approved outcome is committed: `glab issue close <iid> --repo <project-url>`. Native close completes both modes; set no completion label/status. Rehydrate with the full URL to verify closed state; otherwise leave open and report remaining work.

Final answer: exact issue, outcome/artifacts, validation/checks, review, branch/SHA, deferred items, risks, and final GitLab state.

<target>
$ARGUMENTS
</target>
