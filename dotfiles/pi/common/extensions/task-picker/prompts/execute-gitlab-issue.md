---
description: Execute a GitLab issue with safe assignment, approval, review, and validation
argument-hint: "<host/project-path#iid-or-issue-url>"
---
Use triage and pi-subagents. Lead with decisions and required evidence. Keep all material facts, caveats, and next actions; omit filler and repetition. Target: `$ARGUMENTS`.

Goal: the parent owns exact issue resolution, scope, approval, integration, validation, review, and the final answer. Subagents provide bounded context, implementation, and independent review. Never inspect, print, copy, or manage GitLab tokens.

## Resolve and start the issue

Require exactly one canonical `host/group/project#iid` reference or canonical GitLab issue URL. Parse and retain the exact host, project path, IID, and canonical `https://<host>/<group/project>` project URL. Resolve the project explicitly and run `glab issue view <iid> --repo <project-url> --output json` before any mutation. Validate the returned project, host, and IID against the target. Stop with an actionable diagnostic for a missing, inaccessible, or malformed issue. Every subsequent issue and label command must use that same full project URL; never fall back to an unqualified project path or the current directory's host.

Inspect state and assignees before changing anything. If the issue is closed, ask before reopening it. If another user owns it or assignment would conflict with existing work, report the exact non-secret ownership evidence and ask before proceeding. Do not silently override ownership.

Resolve the authenticated user on the target host with `glab api --hostname <host> user --output json` and parse `.username` from JSON without shell interpolation or token output. Assign additively with `glab issue update <iid> --repo <project-url> --assignee +<username>` so existing assignees are preserved.

List existing project labels with `glab label list --repo <project-url> --output json --per-page 100`, paging further when a full page is returned. Identify plausible in-progress labels only from those existing labels. Never create, rename, or guess a label. If exactly one candidate is unambiguous, present its exact name as part of the plan. If none or more than one is plausible, show the compact candidate list and ask the user to choose. Apply only the approved exact label using `glab issue update <iid> --repo <project-url> --label <label>`.

After assignment and labeling, hydrate the issue again. If either mutation partially succeeded, report the persisted state explicitly rather than pretending the whole start operation failed.

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
