---
description: Execute a GitLab issue with safe assignment, approval, review, and validation
argument-hint: "<host/project-path#iid-or-issue-url>"
---
Use triage and pi-subagents. Lead with decisions and required evidence. Keep all material facts, caveats, and next actions; omit filler and repetition. Target: `$ARGUMENTS`.

Goal: the parent owns exact issue resolution, scope, approval, integration, validation, review, and the final answer. Subagents provide bounded context, implementation, and independent review. Never inspect, print, copy, or manage GitLab tokens.

## Resolve configuration and inspect the issue

Before any mutation, read `~/.pi/agent/task-picker.json` with a file-reading tool, not shell output. Parse it as JSON and accept only `version: 1` with `gitlab.workStatus.mode` equal to `scoped-labels` or `none`. A missing, malformed, or unsupported configuration must stop with an actionable diagnostic before assignment or status mutation. Never guess or fall back to another mode.

For `scoped-labels`, require non-empty string values for `inProgressLabel` and `deferredLabel`; retain their exact values as `<in-progress-label>` and `<deferred-label>`. When the injected `[TASK PICKER ISOLATED RUN]` policy is present, also require a non-empty `readyForReviewLabel` and retain it as `<ready-for-review-label>`. For `none`, do not read or infer configured work-status label values, list project labels for status discovery, use labels as workflow-status guards, mutate status, or probe enterprise native status.

Require exactly one canonical `host/group/project#iid` reference or canonical GitLab issue URL. Parse and retain the exact host, project path, IID, and canonical `https://<host>/<group/project>` project URL. Resolve the project explicitly and run `glab issue view <iid> --repo <project-url> --output json` before any mutation. Validate the returned project, host, and IID against the target. Stop with an actionable diagnostic for a missing, inaccessible, or malformed issue. Every subsequent issue and label command must use that same full project URL; never fall back to an unqualified project path or the current directory's host.

Inspect state, assignees, and current labels without changing anything. Normal issue hydration may include ordinary labels as read-only issue context. In `none` mode, those labels must not drive work-status behavior. Resolve the authenticated user on the target host with `glab api --hostname <host> user --output json` and parse `.username` from JSON without shell interpolation or token output.

Only in `scoped-labels` mode, list all existing project labels with `glab label list --repo <project-url> --output json --per-page 100 --page <page>`, starting at page 1 and requesting successive pages until a page contains fewer than 100 labels. Verify the configured labels by exact name. If `<in-progress-label>` is absent, stop with an actionable error. When the injected isolated-run policy is present, also stop before assignment or status mutation if `<ready-for-review-label>` is absent. If `<deferred-label>` is absent but the issue does not currently use it, continue because it is not needed for the start mutation. Never create, rename, substitute, or guess a label.

## Clear all pre-mutation guards

Do not reopen, assign, or mutate status until every applicable guard below is approved:

- If the issue is closed, ask before reopening it.
- If another user owns it or assignment would conflict with existing work, report the exact non-secret ownership evidence and ask before proceeding. Do not silently override ownership.
- Only in `scoped-labels` mode, if the issue currently has `<deferred-label>`, ask exactly: `This issue is deferred (<deferred-label>). Starting it will replace <deferred-label> with <in-progress-label>. Continue?` Substitute the resolved exact label names before asking.

A no or cancellation at any pre-mutation guard performs no reopen, assignment, or status mutation and must not add a noisy issue comment.

## Apply start mutations

After every guard is cleared, reopen the issue first if that was explicitly approved. Assign additively with `glab issue update <iid> --repo <project-url> --assignee +<username>` so existing assignees are preserved.

In `scoped-labels` mode, then apply the configured label with `glab issue update <iid> --repo <project-url> --label <in-progress-label>`. Rely on GitLab scoped-label replacement to replace `<deferred-label>` or another label in the same scope. Never create, rename, or manually remove status labels.

In `none` mode, skip project-label listing for status discovery, every label-based workflow guard, and every status mutation. Ordinary labels from issue hydration remain read-only context only. Self-assignment and the rest of this workflow still apply. Hydrate the issue again after the applicable start mutations. If any mutation partially succeeded, report the exact persisted state rather than pretending the whole start operation failed.

## Build context and approve the plan

Call `subagent({ action: "list" })` before delegation and use only executable, non-disabled agents. Discovery must be bounded to the issue, named repository artifacts, immediate dependencies, and acceptance evidence. Prefer the smallest useful fresh-context read-only `context-builder` or `scout`; use a researcher only for a material current external fact. Never abandon live runs.

Synthesize a plan containing: outcome and non-goals; likely artifacts; done-when behavior; focused validation commands or user flows; required evidence; risks and open decisions; execution shape; and bounded subagent roles. Preserve issue scope and ask before any product, API, architecture, dependency, or scope decision not approved by the issue or conversation.

Ask all necessary clarifying questions. If none, say so. Then ask exactly: `Execute this plan? yes/no/changes`. Do not implement before approval. A `no` or cancellation before implementation must not add a noisy issue comment.

## Execute after approval

Follow the same parent-owned single-writer, integration, and review discipline as the bundled `/execute-beads` workflow:

1. Preserve pre-existing work and choose one active-worktree writer when files overlap or the tree is dirty. Parallel writers require clean isolated worktrees and non-overlapping ownership.
2. Give every worker exact scope, owned artifacts, named references, non-goals, done-when behavior, focused validation, required evidence, and decision stop rules. Workers must not stage, commit, publish, or broaden scope unless approved.
3. Inspect every implementation result and the integrated diff. Run focused validation in the active worktree.
4. Run at least one fresh-context read-only independent reviewer. Classify findings as blockers, fixes-now, optional-defer, or ignore. Fix and re-review non-trivial blockers.
5. Perform final integrated validation and verify the issue acceptance criteria with concrete command or user-flow evidence.

If execution is blocked or validation/review fails after work begins, leave one concise issue note with the blocker and useful non-secret evidence when appropriate. Avoid repeated progress comments and never include secrets, tokens, environment dumps, or unrelated repository details.

## Deliver through merge request

Once the ticket's implementation, acceptance criteria, integrated validation, and review are complete, continue through the repository's merge-request process before reporting completion. Deliver the committed task-scoped changes from the working branch into the repository's exact default branch. Resolve the default branch from authoritative remote project metadata; never assume `main` or `master`, target a parent feature branch, or work directly on the default branch. If the hosting provider calls this a pull request, apply the same policy.

Choose the MR title prefix by release impact: `fix:` for a patch, `feat:` for a minor backward-compatible feature, or `feat!:` for a major breaking change. The entire MR title must be lowercase. Ask the user if the release impact is ambiguous rather than guessing.

Push the working branch without force and create or update one MR with the working branch as its source and the exact default branch as its target. Do not create a duplicate when an open MR already exists for that branch. Create the MR with squash merging enabled and source-branch deletion enabled, link the ticket, and include concise validation and review evidence. Verify the source, target, title, squash setting, and deletion setting after creation.

Follow the repository's required MR checks, CI, review, and approval process without bypassing protections. If authorized to merge once every required check and approval passes, merge with squash and delete the source branch; otherwise leave the correctly configured MR open and report its URL and remaining gate. When the isolated-run policy is active and no-mistakes is available, route the commit, push, MR creation or update, and every MR metadata or settings correction through no-mistakes. Drive and verify that process without performing duplicate out-of-band Git or MR mutations. Record `ready-for-review` only after verifying the MR title, target, squash setting, and source-deletion setting. When no-mistakes is unavailable, use the normal non-isolated delivery procedure above and perform those operations directly.

## Isolated delivery override

Apply this section only when the injected `[TASK PICKER ISOLATED RUN]` policy is present and no-mistakes is available. If no-mistakes is unavailable, follow the normal non-isolated delivery and Finish procedures instead. After approval and again immediately before delivery, verify unattended remote access with `git ls-remote --exit-code origin HEAD`. If an SSH agent such as Secretive is locked, unavailable, or denied, record phase `awaiting-decision`, ask the user to unlock or approve it in this worker tab, and retry before continuing.

After approved implementation, integrated validation, and independent review, leave the task-scoped work for no-mistakes to commit on the existing isolated branch. Call `task_run_update` with phase `validating`, then use the no-mistakes task-first workflow and drive `no-mistakes axi run --intent "<the user's objective and approved tradeoffs>"` and every subsequent `axi respond` yourself until a gate, `checks-passed`, or terminal outcome. Never commit, push, create or update the MR, or correct its metadata or settings outside no-mistakes while it owns the run. Never use `--yes`, edit pipeline findings by hand, or transfer gate ownership to the launcher.

At an ask-user gate, call `task_run_update` with phase `awaiting-decision`, present the finding in this worker tab, and resume the same run after the answer. If no-mistakes cannot fetch or resolve trusted main because SSH-agent authentication is locked or denied, record `awaiting-decision`, ask the user to unlock or approve it, repeat the remote-access preflight, and run `no-mistakes rerun`; do not classify that first authentication failure as terminal. At any other terminal failure, record phase `failed` and retain the tab and worktree.

At `checks-passed`, verify the MR title, target, squash setting, and source-deletion setting. Route any correction through no-mistakes and do not record readiness until verification passes. Then keep the issue open. In `scoped-labels` mode, verify `<ready-for-review-label>` exists by exact name, apply it with `glab issue update <iid> --repo <project-url> --label <ready-for-review-label>`, and rehydrate to verify the issue is open with that label. In `none` mode, do not perform any label or workflow-status lookup or mutation. Then call `task_run_update` with phase `ready-for-review`, summary, and PR URL. Do not execute the normal Finish section below.

## Finish

Close the issue with `glab issue close <iid> --repo <project-url>` only after the approved outcome is implemented, acceptance criteria pass, integrated validation succeeds, and required review findings are resolved. Native close is completion in both modes; do not set a completion label or enterprise native work-item status. Hydrate once more with the same full project URL to verify the closed state. Otherwise leave it open and report the remaining work.

Final answer: exact issue reference, outcome, changed artifacts, validation/check results, review outcome, deferred items, remaining risks, and final GitLab state.
