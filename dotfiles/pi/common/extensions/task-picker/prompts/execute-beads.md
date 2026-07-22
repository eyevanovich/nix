---
description: Execute ready Beads work with approval-gated subagent orchestration
argument-hint: "[bead-id-or-search ...]"
---
Use triage and pi-subagents. Lead with decisions and required evidence. Keep all material facts, caveats, and next actions; omit filler and repetition. Target override: `$ARGUMENTS`.

Goal: the parent owns scope, approval, integration, and the final answer. Subagents provide bounded context, implementation, and independent review.

## Pick bead

If a target is given, resolve each exact Bead ID first; otherwise fuzzy-search title/body. Ask only when a result is ambiguous.

If no target is given, use triage workflow: run `bd ready --label triage:ready-for-agent`; if empty, run `bd ready`. Show compact numbered options and ask the user to choose.

Build an ordered target set. Run `bd show <id>` before claiming; inspect status, dependencies, and acceptance criteria. If the selected target is a parent epic, resolve its child beads and select only the next executable child in dependency order. Do not claim, plan, or execute the remaining children in that epic during this invocation. Atomically claim only executable targets with `bd update <id> --claim`. Stop if another actor owns the claim. Report blocked, closed, or dependency-conflicted targets; ask before overriding readiness. For multiple targets, group only one coherent outcome per execution batch and otherwise follow dependency order. Use `CONTEXT-MAP.md` when present and relevant.

## Build context + approve plan

Before delegation, call `subagent({ action: "list" })`; use only executable, non-disabled agents. Start with the smallest useful delegation and split only when roles or independent workstreams materially improve quality or latency. Prefer `async: true`; use `wait()` / `wait({ all: true })` when no independent parent work remains. Never abandon live runs.

Treat discovery as bounded evidence collection for the plan, not general workspace or domain comprehension. Give each discovery agent exactly one resource group, explicit artifacts/locations/identifiers when known, and concrete questions. If targets are unknown, use one scoped `scout` to identify them before launching `context-builder` against those targets. Never request exhaustive or workspace-wide scans. Stop when the plan questions are answered; report unknowns instead of widening scope.

Use fresh-context, read-only `context-builder`/`scout` only when local discovery will change the plan; add `researcher` only for material external/current evidence. Default each discovery launch to `acceptance: false`, `turnBudget: { maxTurns: 6, graceTurns: 2 }`, and `toolBudget: { soft: 8, hard: 12, block: ["read", "grep", "find", "ls"] }`; raise a budget only for a named evidence gap. Require at most 600 words covering relevant resources/artifacts/identifiers, constraints, plan implications, risks, and open questions—no search narration. Fork only when inherited conversation decisions matter. Give every child a bounded contract: outcome, relevant evidence, constraints/non-goals, done-when criteria, allowed ownership, validation, output shape, and stop/escalation rules. Mention external tools only when needed. Use distinct file-only output paths only when the bounded result is still large.

Synthesize an approval plan with: outcome and non-goals; likely artifacts; done-when behavior; focused validation commands or user flows; required evidence; risks/open decisions; execution shape; and bounded subagent roles. Size each writer slice around one coherent, independently verifiable outcome, one ownership boundary, and one focused validation set. A slice is too broad when it has multiple independent outcomes, crosses unrelated areas or ownership boundaries, needs unrelated validation paths, or cannot be explained with one clear done-when condition. Split it into independent outcome slices or serial milestones before launch. Do not split along arbitrary implementation layers, file types, directories, or process steps when that would create overlap, partial outcomes, or repeated integration work. For separable work, define independent slices with artifact/behavior ownership, dependencies, integration order, and validation. For very large, risky, or cross-cutting work, use milestone gates; parallelize only independent slices within a milestone, then integrate, validate, and review before starting the next. Ask `oracle` only for a genuinely non-obvious decision or risk.

Ask all necessary clarifying questions. If none, say so. Then ask: `Execute this plan? yes/no/changes`. Do not implement before approval.

## Execute after approval

Scale fanout to the task, but always preserve implementation, parent inspection, independent review, and validation:

1. Choose the write shape:
   - Small or tightly coupled: one async `worker` in the active worktree.
   - Independent slices: parallel async `worker`s with `worktree: true` only after confirming a Git repo, clean tree, shared cwd, and non-overlapping ownership.
   - Very large/cross-cutting: staged milestone batches, with independent worktree slices where safe.
   - Dirty tree, overlapping files, or unavailable worktrees: preserve existing changes and run one active-worktree writer at a time.
2. Every writer gets exact scope and owned artifacts, named references, non-goals, done-when behavior, one focused validation set, expected evidence, and decision stop rules. A worker acts from the supplied context; it may inspect only its owned resources, named references, immediate dependencies, and closest validation artifacts before starting. It must ask the parent about missing context instead of reopening broad discovery. Launch with `acceptance: false`: this workflow verifies the integrated result, commands or checks, and independent review at the parent level, rather than failing completed work on a child `acceptance-report` formatting error. Require plain evidence in the result/artifact: changes made, validation performed and results, residual risks, and repository state when relevant. Do not reuse discovery budgets for workers; add a worker `turnBudget` only when the slice is tightly bounded and leave enough grace to validate and report. Workers must not stage, commit, publish, or broaden scope unless approved.
3. For parallel runs, use readable `phase`/`label`, distinct outputs, and file-only mode when large. Wait for all implementation slices.
4. Parent inspects outputs and diffs. For worktree runs, inspect emitted patch artifacts and diff stats; select accepted patches and integration order. Give one active-worktree integration `worker` the exact artifact paths, conflict rules, and validation contract. Validate the integrated active-worktree diff; isolated worktree output is not completion.
5. If a child encounters an unapproved product, API, architecture, scope, dependency, conflict, or validation decision, it must ask the parent via `contact_supervisor` and stop the affected slice. For failed or paused runs, inspect status/artifacts before retrying. Distinguish implementation failure from wrapper/report failure: if the diff and validation succeeded but only acceptance parsing failed, preserve the work and continue parent verification; never rerun implementation just to repair report formatting. Retry only with a corrected bounded task, otherwise ask the user when approved scope would change.
6. Run fresh-context, read-only async `reviewer`s with `acceptance: false`. Use one broad reviewer for low-risk work; add distinct correctness/tests, simplicity, security/performance/docs/domain angles only when risk warrants them. Reviewers report evidence-backed findings and do not edit.
7. Parent classifies findings as blockers, fixes-now, optional-defer, or ignore. Do not apply suggestions blindly. If fixes-now exist, use one async active-worktree `worker`; re-review non-trivial fixes.
8. Parent performs the final integrated diff check and confirms acceptance evidence, validation, and required review before closing anything.

Keep the active worktree single-writer. Parallelize writers only in isolated worktrees with independent ownership; parallelize read-only work freely.

## Isolated delivery override

Apply this section only when the injected `[TASK PICKER ISOLATED RUN]` policy is present. After approval and again immediately before delivery, verify unattended remote access with `git ls-remote --exit-code origin HEAD`. If an SSH agent such as Secretive is locked, unavailable, or denied, record phase `awaiting-decision`, ask the user to unlock or approve it in this worker tab, and retry before continuing.

After approved implementation, integrated validation, and independent review, commit only the task-scoped work on the existing isolated branch. Call `task_run_update` with phase `validating`, then drive `no-mistakes axi run --intent "<the user's objective and approved tradeoffs>"` and every subsequent `axi respond` yourself until a gate, `checks-passed`, or terminal outcome. Never use `--yes`, edit pipeline findings by hand, or transfer gate ownership to the launcher.

At an ask-user gate, call `task_run_update` with phase `awaiting-decision`, present the finding in this worker tab, and resume the same run after the answer. If no-mistakes cannot fetch or resolve trusted main because SSH-agent authentication is locked or denied, record `awaiting-decision`, ask the user to unlock or approve it, repeat the remote-access preflight, and run `no-mistakes rerun`; do not classify that first authentication failure as terminal. At any other terminal failure, record phase `failed` and retain the tab and worktree. At `checks-passed`, leave the Bead open because no ready-for-review tracker status has been approved, call `task_run_update` with phase `ready-for-review`, summary, and PR URL, and do not execute the normal Finish section below.

## Finish

Close each target individually only when its approved outcome, acceptance criteria, integrated diff, focused validation, and required review pass: `bd close <id> --reason="Completed"`. Otherwise leave a concise per-bead note with blocker/failure evidence and remaining work.

After closing a bead selected from a parent epic, report its outcome and ask whether the user wants to continue with the next open executable bead in that epic or start a new session. Do not automatically claim or begin another bead.

Final answer: bead(s), outcome, changed artifacts, validation/check results, review outcome, deferred items, remaining risks, and—when applicable—the explicit continue-or-new-session question.
