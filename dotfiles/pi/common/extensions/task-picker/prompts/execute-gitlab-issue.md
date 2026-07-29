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

Before making implementation changes after approval, resolve the repository's exact default branch from authoritative remote project metadata. If the current branch is that default branch, create and switch to a descriptive task branch before editing. If it is already any non-default branch, including a long-lived branch, keep using it. Never make task changes directly on the default branch.

## Execute after approval

Follow the same parent-owned single-writer, integration, and review discipline as the bundled `/execute-beads` workflow:

1. Preserve pre-existing work and choose one active-worktree writer when files overlap or the tree is dirty. Parallel writers require clean isolated worktrees and non-overlapping ownership.
2. Give every worker exact scope, owned artifacts, named references, non-goals, done-when behavior, focused validation, required evidence, and decision stop rules. Workers must not stage, commit, publish, or broaden scope unless approved.
3. Inspect every implementation result and the integrated diff. Run focused validation in the active worktree.
4. Run at least one fresh-context read-only independent reviewer. Classify findings as blockers, fixes-now, optional-defer, or ignore. Fix and re-review non-trivial blockers.
5. Perform final integrated validation and verify the issue acceptance criteria with concrete command or user-flow evidence.

If execution is blocked or validation/review fails after work begins, leave one concise issue note with the blocker and useful non-secret evidence when appropriate. Avoid repeated progress comments and never include secrets, tokens, environment dumps, or unrelated repository details.

## Complete work or use no-mistakes delivery

After approved implementation, integrated validation, and independent review, create exactly one task-scoped completion commit on the current working branch. Commit only approved task changes and preserve unrelated pre-existing work. Record the resulting branch and commit SHA.

Before invoking no-mistakes, check whether it is runnable in this repository with `no-mistakes axi run --help`, `no-mistakes axi respond --help`, and `no-mistakes axi`; require successful commands and `--intent` support from the run help. This capability check proves only that the committed-HEAD gate is available; it does not imply support for uncommitted work. No-mistakes requires a clean committed HEAD, so verify `git status --porcelain` is empty before invoking it.

When the capability check succeeds and the completion commit leaves a clean handoff, use the No-mistakes delivery section below. Otherwise use direct completion: do not push, create or update an MR, target the default branch, configure squash or source deletion, or require an MR title. Close the issue after verifying the committed outcome. MR creation and integration are explicit later actions.

For no-mistakes delivery, it owns rebase, review-fix commits, push, MR creation or update, MR metadata or settings mutations, and CI. Its MR must target the exact default branch, use squash merging and source-branch deletion, link the ticket, and include concise validation and review evidence. Choose its title type by release impact: `fix:` for a patch, `feat:` for a minor backward-compatible feature, or `feat!:` for a major breaking change. An optional lowercase Conventional Commit scope is allowed, for example `fix(pi):`, `feat(pi):`, or `feat(pi)!:`. The entire MR title must be lowercase, including any scope. Ask the user if release impact is ambiguous. Follow required MR checks, CI, review, and approval without bypassing protections. If authorized, merge with squash and delete the source branch; otherwise leave the configured MR open and report its URL and remaining gate. Record `ready-for-review` only after verifying the MR title, target, squash setting, and source-deletion setting.

## No-mistakes delivery

Apply this section only when the no-mistakes capability check succeeded and the task-scoped completion commit left a clean working tree. The injected `[TASK PICKER ISOLATED RUN]` policy guarantees tool capability, but it does not remove the completion-commit requirement. Before no-mistakes delivery, verify unattended remote access with `git ls-remote --exit-code origin HEAD`. If an SSH agent such as Secretive is locked, unavailable, or denied, record phase `awaiting-decision` when the isolated-run policy is active, ask the user to unlock or approve it, and retry before continuing.

When the isolated-run policy is active, call `task_run_update` with phase `validating`. Drive `no-mistakes axi run --intent "<the user's objective and approved tradeoffs>"` and every subsequent `axi respond` yourself until a gate, `checks-passed`, or terminal outcome. Custody transfers only after `no-mistakes axi run` accepts the committed clean HEAD and reports an active run. Until then, the parent owns recovery and must not leave the branch in a deadlock. No-mistakes then owns rebase, review fixes, subsequent commits, push, MR creation or update, every MR metadata or settings correction, and CI. Do not amend or replace the completion commit, perform duplicate out-of-band Git or MR mutations, use `--yes`, edit pipeline findings by hand, or transfer gate ownership to the launcher.

If `no-mistakes axi run` rejects or fails before reporting an active run, retain parent custody and the completion commit, preserve completed validation and review evidence, and use direct completion. For a pre-custody authentication rejection, record `awaiting-decision` when isolated, ask the user to unlock or approve the credential, repeat the ordinary remote-access preflight, and retry the initial `no-mistakes axi run`; if it still does not report an active run, use direct completion rather than `no-mistakes rerun`. When isolated, call `task_run_update` with phase `validating` before direct completion. Only failures after an active run has accepted custody are no-mistakes terminal outcomes.

At an ask-user gate, call `task_run_update` with phase `awaiting-decision` when the isolated-run policy is active, present the finding, and resume the same run after the answer. Only after an active run has accepted custody, if no-mistakes later reaches a terminal failure because it could not fetch or resolve the trusted default branch resolved from authoritative remote metadata and SSH-agent authentication was locked or denied, record `awaiting-decision` when isolated, ask the user to unlock or approve it, repeat the remote-access preflight, and run `no-mistakes rerun`. At any other terminal failure after custody transfers, record phase `failed` and retain the tab and worktree when isolated; otherwise report the failure and preserve the working branch.

At `checks-passed`, verify the MR title, target, squash setting, and source-deletion setting. Route any correction through no-mistakes and do not record readiness until verification passes. When the isolated-run policy is active, keep the issue open. In `scoped-labels` mode, verify `<ready-for-review-label>` exists by exact name, apply it with `glab issue update <iid> --repo <project-url> --label <ready-for-review-label>`, and rehydrate to verify the issue is open with that label. In `none` mode, do not perform any label or workflow-status lookup or mutation. Then call `task_run_update` with phase `ready-for-review`, summary, and PR URL, and do not execute the normal Finish section below. Without the isolated-run policy, continue to the normal Finish section.

## Finish

Close the issue with `glab issue close <iid> --repo <project-url>` only after the approved outcome is committed, acceptance criteria pass, integrated validation succeeds, and required review findings are resolved. Native close is completion in both modes; do not set a completion label or enterprise native work-item status. Hydrate once more with the same full project URL to verify the closed state. Otherwise leave it open and report the remaining work.

Final answer: exact issue reference, outcome, changed artifacts, validation/check results, review outcome, branch and completion commit SHA, deferred items, remaining risks, and final GitLab state.
