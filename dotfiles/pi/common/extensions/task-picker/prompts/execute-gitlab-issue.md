---
description: Execute a GitLab issue with safe assignment, approval, review, and validation
argument-hint: "<host/project-path#iid-or-issue-url>"
---
You own exact issue resolution, scope, approval, integration, validation, review, completion, and the final answer. Use triage and pi-subagents; subagents provide bounded discovery, implementation, or independent review. Lead with decisions and evidence. Preserve material facts; omit narration and repetition. Never inspect, print, copy, or manage GitLab tokens.

## Resolve configuration and issue

Before mutation, read `~/.pi/agent/task-picker.json` with a file-reading tool. Require JSON `version: 1` and `gitlab.workStatus.mode` of `scoped-labels` or `none`; otherwise stop with an actionable diagnostic. Never guess a fallback.

| Mode | Required configuration and behavior |
|---|---|
| `scoped-labels` | Require non-empty `inProgressLabel` and `deferredLabel`; when `[TASK PICKER ISOLATED RUN]` is present, also require `readyForReviewLabel`. Retain their exact values. Verify needed labels by exact name. Use configured scoped labels for workflow status. |
| `none` | Do not read/infer workflow-label values, list labels for status discovery, use labels as workflow guards, mutate workflow status, or probe native status. Hydrated ordinary labels remain read-only context. |

Require exactly one canonical `host/group/project#iid` reference or GitLab issue URL. Retain exact host, project path, IID, and canonical `https://<host>/<group/project>` project URL. Resolve explicitly; before mutation run `glab issue view <iid> --repo <project-url> --output json` and validate returned host/project/IID. Every issue/label command uses that same full URL, never an unqualified path or current-directory host.

Inspect state, assignees, and labels without mutation. Resolve the target-host user with `glab api --hostname <host> user --output json`; parse `.username` from JSON without shell interpolation or token output.

In `scoped-labels`, paginate `glab label list --repo <project-url> --output json --per-page 100 --page <page>` from page 1 until fewer than 100 results. Stop if the exact in-progress label is absent; in isolated runs also stop if ready-for-review is absent. A missing deferred label is allowed only when the issue does not use it. Never create, rename, substitute, or guess labels.

## Guard and start

Clear every applicable guard before reopening, assignment, or status mutation:

- Closed issue: ask before reopening.
- Any existing assignees other than the resolved user: show exact non-secret evidence and ask before additive self-assignment; never remove or silently override them.
- `scoped-labels` deferred issue: ask exactly `This issue is deferred (<deferred-label>). Starting it will replace <deferred-label> with <in-progress-label>. Continue?`, substituting exact resolved names.

A no/cancellation performs no mutation and adds no noisy comment.

After approval: reopen first if approved; assign additively with `glab issue update <iid> --repo <project-url> --assignee +<username>`. In `scoped-labels`, apply `<in-progress-label>` with `glab issue update <iid> --repo <project-url> --label <in-progress-label>` and rely on scoped-label replacement; never manually remove status labels. In `none`, perform no workflow-status mutation. Rehydrate after mutations and report exact persisted state after partial failure.

## Plan and approve

Call `subagent({ action: "list" })` before delegation and use only executable agents. Discovery is optional, fresh-context, read-only, and bounded to the issue, named artifacts, immediate dependencies, and plan-changing evidence. Prefer one `context-builder` or `scout`; use a researcher only for a material current external fact. Never abandon live runs.

Present a plan containing outcome/non-goals, likely artifacts, done-when behavior, focused validation/user flows, required evidence, risks/open decisions, execution shape, and bounded subagent roles. Preserve issue scope; ask before changing product/API/architecture/scope/dependencies. Ask all necessary clarifying questions; otherwise say none. Then ask exactly: `Execute this plan? yes/no/changes`. Do not implement before approval.

After approval, resolve the exact default branch from authoritative remote metadata. If currently on it, create and switch to a descriptive task branch. Otherwise retain the current non-default branch. Never make task changes directly on the default branch.

## Implement

Use one active-worktree writer for coupled work, a dirty tree, or overlapping files. Parallel writers require a clean repository, isolated worktrees, and disjoint ownership. Workers receive approved scope, owned artifacts, named references, non-goals, done-when behavior, focused validation, evidence, and decision stops. They do not stage, commit, publish, broaden scope, or make unapproved product/API/architecture decisions.

The parent inspects every result and integrated diff, runs focused validation in the active worktree, and verifies acceptance criteria with command/user-flow evidence. If blocked after work begins, leave at most one concise issue note with useful non-secret evidence.

## Validate and review

Run at least one fresh-context, read-only independent review. Classify findings as blocker, fixes-now, optional-defer, or ignore. Fix and re-review non-trivial blockers/fixes-now. Finish with an integrated diff check and final validation.

## Deliver

Create exactly one task-scoped completion commit after implementation, integrated validation, and independent review pass. Commit only approved task changes; preserve unrelated work. Record branch and SHA.

Check no-mistakes capability with `no-mistakes axi run --help`, `no-mistakes axi respond --help`, and `no-mistakes axi`; require success and `--intent` support. It requires committed HEAD and `git status --porcelain` empty.

Direct completion applies when capability or clean handoff is unavailable: retain parent custody, do not push or create/update an MR, skip the no-mistakes steps below, and continue to Finish with verified work only.

No-mistakes delivery applies only after capability and clean-HEAD checks pass:

- Before handoff run `git ls-remote --exit-code origin HEAD`. For locked/denied SSH credentials, set isolated phase `awaiting-decision` when applicable, ask the user, then retry.
- Set isolated phase `validating` when applicable. Run `no-mistakes axi run --intent "<objective and approved tradeoffs>"`; drive every `axi respond` yourself. Never use `--yes`.
- Custody transfers only when `axi run` reports an active run. Before transfer, the parent owns recovery and direct completion; never use `rerun`. After transfer, no-mistakes exclusively owns rebase, review fixes, commits, push, MR creation/update/settings, and CI; make no duplicate out-of-band mutations or hand-edits.
- The MR targets the exact default branch, links the ticket, enables squash and source deletion, and includes validation/review evidence. Its lowercase title is `fix:`, `feat:`, or `feat!:` by release impact, with optional lowercase scope. Ask if impact is ambiguous.
- At an ask-user gate, set `awaiting-decision` when isolated, ask, and resume the same run.
- Pre-custody rejection: preserve completion commit and evidence; retry once after credential recovery when applicable, otherwise direct completion.
- Post-custody default-branch fetch failure caused by locked/denied SSH: set `awaiting-decision`, restore credentials, repeat preflight, then run `no-mistakes rerun`. Any other terminal post-custody failure sets isolated phase `failed` when applicable and preserves the branch/worktree.
- Follow required checks, CI, review, and approval without bypassing protections. At `checks-passed`, verify title, target, squash, and source deletion through no-mistakes. In an isolated run, keep the issue open; in `scoped-labels`, verify/apply `<ready-for-review-label>` and rehydrate, while `none` performs no workflow-label lookup/mutation. Then set phase `ready-for-review` with summary and PR URL and skip Finish. Otherwise, if authorized, merge with squash and delete the source branch; if not, leave the configured MR open and report its URL and remaining gate.

## Finish

Close with `glab issue close <iid> --repo <project-url>` only when the approved outcome is committed, acceptance criteria pass, integrated validation succeeds, and required findings are resolved. Native close is completion in both modes; do not set a completion label/status. Rehydrate with the full URL to verify closed state; otherwise leave open and report remaining work.

Final answer: exact issue, outcome, changed artifacts, validation/check results, review outcome, branch and commit SHA, deferred items, risks, and final GitLab state.

<target>
$ARGUMENTS
</target>
