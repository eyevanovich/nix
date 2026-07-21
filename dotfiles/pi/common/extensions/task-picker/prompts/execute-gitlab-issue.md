---
description: Execute a GitLab issue with safe assignment, approval, review, and validation
argument-hint: "<host/project-path#iid-or-issue-url>"
---
Use triage and pi-subagents. Lead with decisions and required evidence. Keep all material facts, caveats, and next actions; omit filler and repetition. Target: `$ARGUMENTS`.

Goal: the parent owns exact issue resolution, scope, approval, integration, validation, review, and the final answer. Subagents provide bounded context, implementation, and independent review. Never inspect, print, copy, or manage GitLab tokens.

## Resolve and inspect the issue

Require exactly one canonical `host/group/project#iid` reference or canonical GitLab issue URL. Parse and retain the exact host, project path, IID, and canonical `https://<host>/<group/project>` project URL. Resolve the project explicitly and run `glab issue view <iid> --repo <project-url> --output json` before any mutation. Validate the returned project, host, and IID against the target. Stop with an actionable diagnostic for a missing, inaccessible, or malformed issue. Every subsequent issue and label command must use that same full project URL; never fall back to an unqualified project path or the current directory's host.

Inspect state, assignees, and current labels without changing anything. Resolve the authenticated user on the target host with `glab api --hostname <host> user --output json` and parse `.username` from JSON without shell interpolation or token output.

List all existing project labels with `glab label list --repo <project-url> --output json --per-page 100 --page <page>`, starting at page 1 and requesting successive pages until a page contains fewer than 100 labels. Verify the exact existing label `status::in-progress` is present. If it is missing, stop with an actionable error; never create, rename, substitute, or guess a label.

## Clear all pre-mutation guards

Do not reopen, assign, or label the issue until every applicable guard below is approved:

- If the issue is closed, ask before reopening it.
- If another user owns it or assignment would conflict with existing work, report the exact non-secret ownership evidence and ask before proceeding. Do not silently override ownership.
- If the issue currently has `status::deferred`, ask exactly: `This issue is deferred. Starting it will replace status::deferred with status::in-progress. Continue?`

A no or cancellation at any pre-mutation guard performs no reopen, assignment, or label mutation and must not add a noisy issue comment.

## Apply start mutations

After every guard is cleared, reopen the issue first if that was explicitly approved. Assign additively with `glab issue update <iid> --repo <project-url> --assignee +<username>` so existing assignees are preserved. Then apply the approved exact label with `glab issue update <iid> --repo <project-url> --label status::in-progress`.

Rely on GitLab scoped-label replacement to replace `status::deferred` or another existing `status::*` value. Do not manually remove scoped status labels. Hydrate the issue again after assignment and labeling. If any mutation partially succeeded, report the exact persisted state rather than pretending the whole start operation failed.

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

## Finish

Close the issue with `glab issue close <iid> --repo <project-url>` only after the approved outcome is implemented, acceptance criteria pass, integrated validation succeeds, and required review findings are resolved. Hydrate once more with the same full project URL to verify the closed state. Otherwise leave it open and report the remaining work.

Final answer: exact issue reference, outcome, changed artifacts, validation/check results, review outcome, deferred items, remaining risks, and final GitLab state.
