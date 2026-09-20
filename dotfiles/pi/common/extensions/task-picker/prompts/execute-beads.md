---
description: Execute ready Beads work with approval-gated subagent orchestration
argument-hint: "[bead-id-or-search ...]"
---
<!-- task-picker:execute-beads:v1 -->
Use pi-subagents for delegation. You own resolution, approval, integration, validation, review, and completion. Report decisions and evidence without narration or repetition.

## Resolve and claim

Empty target: run `bd ready --label triage:ready-for-agent`, then `bd ready` if needed; offer numbered choices. Otherwise resolve exact Bead IDs before fuzzy-searching title/body; ask on ambiguity.

Before claiming, run `bd show <id>`; check status, dependencies, acceptance criteria, and relevant `CONTEXT-MAP.md`. For epics, select only the next executable child. Group targets only for one coherent outcome; otherwise follow dependency order. Report blocked, closed, or dependency-conflicted work and ask before overriding readiness. Claim executable targets atomically with `bd update <id> --claim`; stop on another owner's claim.

## Plan and approve

Use triage only when readiness or requirements remain unresolved; otherwise use the existing brief and settled decisions. Always retain the tracker guards above and verify whether the requested behavior already exists. Consult relevant domain docs/ADRs and prior rejection notes when applicable; ask before overriding a prior rejection.

Choose the smallest execution shape: for a small, low-risk task with known files and checks, the parent implements, then one independent reviewer reviews the resulting diff. Delegate substantial work to a bounded writer. Discovery is optional, fresh-context, read-only: use one scout only for plan-changing unknowns, a researcher only for material current external facts, an oracle only for non-obvious decisions.

Before delegation, call `subagent({ action: "list", capabilities: true })`; use executable, non-disabled agents (external runners also require `runner.available === true`). Each child receives a compact, self-contained packet: task and acceptance criteria, repo/cwd/ref, owned artifacts, settled decisions, named references, constraints/non-goals, validation commands/evidence, output shape, and stop/ask conditions. Include needed issue content, not just a link. Limit discovery to these resources, immediate dependencies, and nearest validation artifacts; ask before widening. Ask before product/API/architecture/scope/dependency changes or conflict resolution.

Use plain language; explain necessary jargon. If blocked, start **Questions before I can start**: ask at most three questions per round, one decision per question; note remaining known blockers. Say what you need and why; offer evidence-backed choices/recommendations when available, plus “help me decide”. Give a simple reply format, e.g. `1: A; 2: ...`. Uncertainty calls for bounded, authorized read-only discovery, not guessing or requesting secrets. Do not ask for execution approval while blockers remain.

Clarification answers are not execution approval. With no blockers, go directly to **Ready for approval**: briefly state the outcome, files/artifacts likely to change, non-goals, success checks/evidence, execution roles, risks, and non-blocking assumptions. Put short evidence references last; offer detailed logs on request. Use milestone gates for risky cross-cutting work. Then ask exactly: `Execute this plan? yes/no/changes`. Implementation requires approval. Pause if new blockers appear; seek renewed approval for changed scope.

After approval, resolve the exact default branch from authoritative remote metadata. Switch to a descriptive task branch if on default; otherwise retain the current branch. Never make task changes directly on the default branch.

## Implement

Native workers explicitly use `context: "fresh"`. Use `context: "fork"` only when essential decisions depend on parent history; state that dependency before launch. External runners keep their own contracts; omit unsupported native context options.

Use one active-worktree writer for coupled work, a dirty tree, or overlapping files. Parallel writers require a clean repository, isolated worktrees, and disjoint ownership; read-only work may run in parallel. Workers follow the approved contract; staging, commits, and publishing belong to the parent/delivery workflow.

Inspect every result and integrated diff. For worktree output, inspect patches, order integration, and use one active-worktree integration writer. Never abandon live runs. Inspect failed/paused run status and artifacts before a bounded retry; preserve successful work if only wrapper/report formatting failed.

## Validate and review

Run focused validation in the active worktree and at least one fresh-context, read-only independent review after implementation; add specialist reviews only for material risks. Supply reviewers the approved criteria, exact diff or readable diff artifact, and validation evidence. Classify findings: blocker, fixes-now, optional-defer, ignore. Fix blockers/fixes-now. Re-review non-trivial fixes: accepted fixes, unresolved findings, and regressions in the affected area; widen only when new evidence warrants it.

Completion gate: approved outcome implemented, every acceptance criterion evidenced, integrated diff checked, final validation passed, and required review findings resolved. Only then create exactly one task-scoped completion commit, preserving unrelated work. Record branch and SHA.

## Deliver

Retain custody. Do not push or create an MR; MR creation and integration are explicit later actions. Once the completion gate passes and the task-scoped completion commit exists, continue directly to Finish.

## Finish

Close each committed target satisfying the completion gate with `bd close <id> --reason="Completed"`; otherwise leave a concise note with blocker evidence and remaining work.

After an epic child, report its outcome and ask whether to continue with the next executable child or start a new session; claim no sibling automatically.

Final answer: Bead(s), outcome/artifacts, validation/checks, review, branch/SHA, deferred items, risks, and epic continuation question if applicable.

<target>
$ARGUMENTS
</target>
