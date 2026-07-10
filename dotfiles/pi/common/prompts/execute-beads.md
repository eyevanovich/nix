---
description: Execute ready Beads work with approval-gated subagent orchestration
argument-hint: "[bead-id-or-search ...]"
---
Use triage and pi-subagents. Lead with decisions and required evidence. Keep all material facts, caveats, and next actions; omit filler and repetition. Target override: `$ARGUMENTS`.

Goal: the parent owns scope, approval, integration, and the final answer. Subagents provide bounded context, implementation, and independent review.

## Pick bead

If a target is given, resolve each exact Bead ID first; otherwise fuzzy-search title/body. Ask only when a result is ambiguous.

If no target is given, use triage workflow: run `bd ready --label triage:ready-for-agent`; if empty, run `bd ready`. Show compact numbered options and ask the user to choose.

Build an ordered target set. Run `bd show <id>` before claiming; inspect status, dependencies, and acceptance criteria. Atomically claim only executable targets with `bd update <id> --claim`. Stop if another actor owns the claim. Report blocked, closed, or dependency-conflicted targets; ask before overriding readiness. For multiple targets, group only one coherent outcome per execution batch and otherwise follow dependency order. Use `CONTEXT-MAP.md` when present and relevant.

## Build context + approve plan

Before delegation, call `subagent({ action: "list" })`; use only executable, non-disabled agents. Start with the smallest useful delegation and split only when roles or independent workstreams materially improve quality or latency. Prefer `async: true`; use `wait()` / `wait({ all: true })` when no independent parent work remains. Never abandon live runs.

Treat discovery as bounded evidence collection for the plan, not general codebase comprehension. Give each discovery agent exactly one resource group, explicit files/directories/symbols when known, and concrete questions. If locations are unknown, use one scoped `scout` to identify them before launching `context-builder` against those targets. Never request exhaustive or repository-wide scans. Stop when the plan questions are answered; report unknowns instead of widening scope.

Use fresh-context, read-only `context-builder`/`scout` only when local discovery will change the plan; add `researcher` only for material external/current evidence. Default each discovery launch to `turnBudget: { maxTurns: 3, graceTurns: 1 }` and `toolBudget: { soft: 8, hard: 12, block: ["read", "grep", "find", "ls"] }`; raise a budget only for a named evidence gap. Require at most 600 words covering relevant files/symbols, constraints, plan implications, risks, and open questions—no search narration. Fork only when inherited conversation decisions matter. Give every child a bounded contract: outcome, relevant evidence, constraints/non-goals, done-when criteria, allowed ownership, validation, output shape, and stop/escalation rules. Mention external tools only when needed. Use distinct file-only output paths only when the bounded result is still large.

Synthesize an approval plan with: outcome and non-goals; likely files; done-when behavior; focused validation commands or user flows; required evidence; risks/open decisions; execution shape; and bounded subagent roles. For separable work, define independent slices with file/behavior ownership, dependencies, integration order, and validation. For very large, risky, or cross-cutting work, use milestone gates; parallelize only independent slices within a milestone, then integrate, validate, and review before starting the next. Ask `oracle` only for a genuinely non-obvious decision or risk.

Ask all necessary clarifying questions. If none, say so. Then ask: `Execute this plan? yes/no/changes`. Do not implement before approval.

## Execute after approval

Scale fanout to the task, but always preserve implementation, parent inspection, independent review, and validation:

1. Choose the write shape:
   - Small or tightly coupled: one async `worker` in the active worktree.
   - Independent slices: parallel async `worker`s with `worktree: true` only after confirming a Git repo, clean tree, shared cwd, and non-overlapping ownership.
   - Very large/cross-cutting: staged milestone batches, with independent worktree slices where safe.
   - Dirty tree, overlapping files, or unavailable worktrees: preserve existing changes and run one active-worktree writer at a time.
2. Every writer gets exact scope/files, non-goals, done-when behavior, validation, expected evidence, and decision stop rules. Use explicit `acceptance`: `checked` for ordinary changes; `verified` only with concrete runtime verification commands. Child claims do not count as runtime verification. Workers must not stage, commit, or broaden scope unless approved.
3. For parallel runs, use readable `phase`/`label`, distinct outputs, and file-only mode when large. Wait for all implementation slices.
4. Parent inspects outputs and diffs. For worktree runs, inspect emitted patch artifacts and diff stats; select accepted patches and integration order. Give one active-worktree integration `worker` the exact artifact paths, conflict rules, and validation contract. Validate the integrated active-worktree diff; isolated worktree output is not completion.
5. If a child encounters an unapproved product, API, architecture, scope, dependency, conflict, or validation decision, it must ask the parent via `contact_supervisor` and stop the affected slice. For failed or paused runs, inspect status/artifacts; retry only with a corrected bounded task, otherwise ask the user when approved scope would change.
6. Run fresh-context, read-only async `reviewer`s. Use one broad reviewer for low-risk work; add distinct correctness/tests, simplicity, security/performance/docs/domain angles only when risk warrants them. Reviewers report evidence-backed findings and do not edit.
7. Parent classifies findings as blockers, fixes-now, optional-defer, or ignore. Do not apply suggestions blindly. If fixes-now exist, use one async active-worktree `worker`; re-review non-trivial fixes.
8. Parent performs the final integrated diff check and confirms acceptance evidence, validation, and required review before closing anything.

Keep the active worktree single-writer. Parallelize writers only in isolated worktrees with independent ownership; parallelize read-only work freely.

## Finish

Close each target individually only when its approved outcome, acceptance criteria, integrated diff, focused validation, and required review pass: `bd close <id> --reason="Completed"`. Otherwise leave a concise per-bead note with blocker/failure evidence and remaining work.

Final answer: bead(s), outcome, changed files, validation commands/results, review outcome, deferred items, and remaining risks.
