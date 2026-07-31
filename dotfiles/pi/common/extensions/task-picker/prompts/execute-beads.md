---
description: Execute ready Beads work with approval-gated subagent orchestration
argument-hint: "[bead-id-or-search ...]"
---
You own task resolution, scope, approval, integration, validation, review, completion, and the final answer. Use triage and pi-subagents; subagents provide bounded discovery, implementation, or independent review. Lead with decisions and evidence. Preserve material facts; omit narration and repetition.

## Resolve and claim

If the target is empty, run `bd ready --label triage:ready-for-agent`, then `bd ready` if needed; show compact numbered choices. Otherwise resolve exact Bead IDs first, then fuzzy-search title/body; ask only when ambiguous.

Run `bd show <id>` before claiming. Check status, dependencies, acceptance criteria, and relevant `CONTEXT-MAP.md`. For an epic, select only its next executable child; do not claim or execute siblings. Group multiple targets only when they form one coherent outcome; otherwise follow dependency order. Claim executable targets atomically with `bd update <id> --claim`. Stop on another owner's claim. Report blocked, closed, or dependency-conflicted work and ask before overriding readiness.

## Plan and approve

Call `subagent({ action: "list" })` before delegation and use only executable agents. Discovery is optional, fresh-context, read-only, and limited to evidence that can change the plan. Prefer one bounded `context-builder` or `scout`; add a researcher only for a material current external fact and an oracle only for a genuinely non-obvious decision. Never abandon live runs.

Every child contract names its outcome, artifacts, constraints/non-goals, done-when behavior, validation, evidence, ownership, output shape, and stop/escalation rules. Discovery may inspect only named resources and immediate dependencies; report unknowns instead of widening scope.

Present a plan containing outcome/non-goals, likely artifacts, done-when behavior, focused validation, required evidence, risks/open decisions, execution shape, and bounded subagent roles. Split work by independently verifiable outcomes and non-overlapping ownership—not arbitrary layers or file types. Use milestone gates for risky cross-cutting work.

Ask necessary clarifying questions; otherwise say none. Then ask exactly: `Execute this plan? yes/no/changes`. Do not implement before approval.

After approval, resolve the exact default branch from authoritative remote metadata. If currently on it, create and switch to a descriptive task branch. Otherwise retain the current non-default branch. Never make task changes directly on the default branch.

## Implement

Use one active-worktree writer for coupled work, a dirty tree, or overlapping files. Parallel writers require a clean Git repository, isolated worktrees, and disjoint ownership. Parallelize read-only work freely.

Workers receive the approved scope, owned artifacts, named references, non-goals, done-when behavior, focused validation, required evidence, and decision stops. They may inspect only owned resources, named references, immediate dependencies, and nearest validation artifacts. They must ask before changing product/API/architecture/scope/dependencies, handling conflicts, or broadening discovery. Workers do not stage, commit, publish, or broaden scope.

The parent inspects every result and integrated diff. For worktree output, inspect patch artifacts, choose integration order, and use one active-worktree integration writer. Failed or paused runs require status/artifact inspection before a bounded retry; preserve successful work when only wrapper/report formatting failed.

## Validate and review

Run focused validation in the active worktree. Then run at least one fresh-context, read-only independent review; add specialized correctness, tests, simplicity, security, performance, docs, or domain reviews only when risk warrants it. Reviewers report evidence and never edit.

Classify findings as blocker, fixes-now, optional-defer, or ignore. Fix and re-review non-trivial blockers/fixes-now. Finish with an integrated diff check, final validation, and concrete evidence for every acceptance criterion.

## Deliver

Create exactly one task-scoped completion commit after implementation, integrated validation, and independent review pass. Commit only approved task changes; preserve unrelated work. Record branch and SHA.

Check no-mistakes capability with `no-mistakes axi run --help`, `no-mistakes axi respond --help`, and `no-mistakes axi`; require success and `--intent` support. It requires committed HEAD and `git status --porcelain` empty.

Direct completion applies when capability or a clean handoff is unavailable: retain parent custody, do not push or create an MR, skip the no-mistakes steps below, and continue to Finish with verified work only.

No-mistakes delivery applies only after capability and clean-HEAD checks pass:

- Before handoff, run `git ls-remote --exit-code origin HEAD`. For locked/denied SSH credentials, set isolated phase `awaiting-decision` when applicable, ask the user, then retry.
- Set isolated phase `validating` when applicable. Run `no-mistakes axi run --intent "<objective and approved tradeoffs>"`; drive every `axi respond` yourself. Never use `--yes`.
- Custody transfers only when `axi run` reports an active run. Before transfer, the parent owns recovery and direct completion; never use `rerun`. After transfer, no-mistakes exclusively owns rebase, review fixes, commits, push, MR creation/update/settings, and CI; make no duplicate out-of-band mutations or hand-edits.
- The MR targets the exact default branch, links the ticket, enables squash and source deletion, and includes validation/review evidence. Its lowercase title is `fix:`, `feat:`, or `feat!:` by release impact, with an optional lowercase scope. Ask if impact is ambiguous.
- At an ask-user gate, set `awaiting-decision` when isolated, ask, and resume the same run.
- Pre-custody rejection: preserve the completion commit and validation/review evidence; retry once after credential recovery when applicable, otherwise use direct completion.
- Post-custody default-branch fetch failure caused by locked/denied SSH: set `awaiting-decision`, restore credentials, repeat preflight, then run `no-mistakes rerun`. Any other terminal post-custody failure sets isolated phase `failed` when applicable and preserves the branch/worktree.
- Follow required checks, CI, review, and approval without bypassing protections. At `checks-passed`, verify title, target, squash, and source deletion through no-mistakes. In an isolated run, leave the Bead open, set phase `ready-for-review` with summary and PR URL, and skip Finish. Otherwise, if authorized, merge with squash and delete the source branch; if not, leave the configured MR open and report its URL and remaining gate.

## Finish

Close each verified target with `bd close <id> --reason="Completed"` only when its approved outcome is committed, acceptance criteria pass, validation succeeds, and required findings are resolved. Otherwise leave a concise note with blocker evidence and remaining work.

After completing an epic child, report its outcome and ask whether to continue with the next executable child or start a new session; never claim it automatically.

Final answer: bead(s), outcome, changed artifacts, validation/check results, review outcome, branch and commit SHA, deferred items, risks, and the epic continuation question when applicable.

<target>
$ARGUMENTS
</target>
