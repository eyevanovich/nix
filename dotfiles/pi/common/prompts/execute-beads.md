---
description: Execute ready Beads work with triage-first subagent orchestration
argument-hint: "[bead-id-or-search ...]"
---
Caveman mode now. Use triage, pi-subagents, caveman skills.

Goal: parent orchestrates Beads work; subagents gather/plan/build/review. Keep context tight. Target override: `$ARGUMENTS`.

## Pick bead

If target given: resolve exact Bead ID(s) first, else fuzzy search title/body. Ask only if ambiguous.

If no target: use triage workflow, run `bd ready --label triage:ready-for-agent`; if empty, run `bd ready`. Show compact numbered options, ask user to choose.

After choosing: auto-claim with `bd update <id> --claim`, inspect `bd show <id>`, then route docs from `CONTEXT-MAP.md` only as needed.

## Build context + approve plan

Before any subagent run: `subagent({ action: "list" })`; use only available non-disabled agents.

Use read-only subagents for context before planning when useful: `context-builder`/`scout`; add `researcher` only if external/current docs matter. Tell children: terse/caveman; no source edits during context/planning; Context7 and pi-web-access exist if third-party docs/web research needed.

Wait for all children (`wait()` / `wait({ all: true })`). Do not abandon live subagents.

Synthesize compact plan: scope, likely files, validation contract, risks/open decisions, execution shape. Skip formal planning only for trivial work and say why. Before asking for implementation approval, ask needed clarifying questions; if none, say so. Ask user: `Execute this plan? yes/no/changes`. No implementation before approval.

## Execute after approval

Use default loop every time:
1. One `worker` implements. Single writer in active worktree.
2. Wait.
3. Parallel fresh-context `reviewer`s: correctness/regressions, tests/validation, simplicity/maintainability. Add security/perf/docs/domain/user-flow angle if warranted.
4. Wait.
5. Parent synthesizes blockers / fixes-now / optional-defer / ignore.
6. If fixes-now exist, one `worker` fix pass.
7. Wait; re-review if fix pass non-trivial.
8. Parent final diff + validation pass.

Parallelize only read-only research/planning/review/validation. Ask before parallel writers/worktrees.

## Finish

Run focused validation when possible. Close completed bead with `bd close <id> --reason="Completed"`; otherwise leave concise note/comment with blockers/remaining work.

Final: bead, changed files, validation, review outcome, remaining risks.
