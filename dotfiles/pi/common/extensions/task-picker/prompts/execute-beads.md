---
description: Execute ready Beads work with approval-gated subagent orchestration
argument-hint: "[bead-id-or-search ...]"
---
Use triage and pi-subagents. You own resolution, approval, integration, validation, review, and completion; delegate bounded discovery, implementation, or independent review. Report decisions and evidence without narration or repetition.

## Resolve and claim

Empty target: run `bd ready --label triage:ready-for-agent`, then `bd ready` if needed; offer numbered choices. Otherwise resolve exact Bead IDs before fuzzy-searching title/body; ask on ambiguity.

Before claiming, run `bd show <id>`; check status, dependencies, acceptance criteria, and relevant `CONTEXT-MAP.md`. For epics, select only the next executable child. Group targets only for one coherent outcome; otherwise follow dependency order. Report blocked, closed, or dependency-conflicted work and ask before overriding readiness. Claim executable targets atomically with `bd update <id> --claim`; stop on another owner's claim.

## Plan and approve

Before delegation, call `subagent({ action: "list", capabilities: true })`; use executable, non-disabled agents (external runners also require `runner.available === true`). Discovery is optional, fresh-context, read-only: prefer one `context-builder` or `scout`, a researcher only for material current external facts, an oracle only for non-obvious decisions.

Each child contract specifies outcome, owned artifacts, named references, constraints/non-goals, done-when behavior, validation/evidence, output shape, and decision stops. Limit inspection to owned/named resources, immediate dependencies, and nearest validation artifacts; report unknowns and ask before widening discovery. Ask before product/API/architecture/scope/dependency changes or conflict resolution.

Present outcome/non-goals, likely artifacts, done-when behavior, focused validation/evidence, risks/open decisions, execution shape, and bounded roles. Split by independently verifiable outcomes and disjoint ownership; use milestone gates for risky cross-cutting work. Ask necessary clarifications (otherwise state none), then exactly: `Execute this plan? yes/no/changes`. Implementation requires approval.

After approval, resolve the exact default branch from authoritative remote metadata. Switch to a descriptive task branch if on default; otherwise retain the current branch. Never make task changes directly on the default branch.

## Implement

Use one active-worktree writer for coupled work, a dirty tree, or overlapping files. Parallel writers require a clean repository, isolated worktrees, and disjoint ownership; read-only work may run in parallel. Workers follow the approved contract; staging, commits, and publishing belong to the parent/delivery workflow.

Inspect every result and integrated diff. For worktree output, inspect patches, order integration, and use one active-worktree integration writer. Never abandon live runs. Inspect failed/paused run status and artifacts before a bounded retry; preserve successful work if only wrapper/report formatting failed.

## Validate and review

Run focused validation in the active worktree and at least one fresh-context, read-only independent review with evidence; add specialist reviews only for material risks. Classify findings: blocker, fixes-now, optional-defer, ignore. Fix blockers/fixes-now; re-review non-trivial fixes.

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
