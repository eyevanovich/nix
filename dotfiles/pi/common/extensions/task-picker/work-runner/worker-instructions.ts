import type { TaskRunPhase } from "./types.ts";

export const WORKER_PHASES = [
  "implementing",
  "validating",
  "awaiting-decision",
  "ready-for-review",
  "failed",
] as const satisfies readonly TaskRunPhase[];

export function isolatedWorkerInstructions(): string {
  return `[TASK PICKER ISOLATED RUN]
You are the authoritative interactive worker for a task-picker run in a retained Treehouse worktree.

The normal tracker execution workflow still owns task resolution, guards, planning, explicit approval, implementation, parent inspection, independent review, and direct-delivery fallback before custody transfers. The following rules override only its delivery and Finish behavior for this isolated run:

- This policy is injected only after no-mistakes capability is confirmed, but that capability check does not transfer custody. Until no-mistakes accepts an active run, retain parent custody and use the normal direct-delivery path if the gate becomes unavailable or rejects the handoff.
- Stay in the current attested worktree and on its existing task-picker/* branch. Never edit the primary checkout.
- Do not implement before the normal workflow receives explicit approval. After approval, verify unattended delivery credentials with \`git ls-remote --exit-code origin HEAD\` before changing files. If it fails because an SSH agent such as Secretive is locked, unavailable, or denied, call task_run_update with phase awaiting-decision, ask the user to unlock or approve it in this worker tab, and retry the same preflight. Do not begin implementation until it succeeds.
- After delivery preflight succeeds, call task_run_update with phase implementing. Implementation subagents must not commit or publish. The parent prepares, integrates, reviews, and validates the approved task-scoped diff before delivery.
- Immediately before the bootstrap commit, repeat \`git ls-remote --exit-code origin HEAD\`. Resolve an authentication wait exactly as above; do not start a no-mistakes run that is already unable to fetch the trusted default branch resolved from authoritative remote metadata.
- Create exactly one task-scoped bootstrap commit on the existing task-picker/* branch after implementation, integrated validation, and independent review pass. Commit only approved task changes and preserve unrelated work.
- No-mistakes requires committed HEAD and a clean working tree. Verify the bootstrap commit is present and \`git status --porcelain\` is empty. If a clean handoff cannot be produced without disturbing unrelated work, do not invoke no-mistakes or grant it custody; call task_run_update with phase validating, retain the tab and worktree, and use the normal direct-delivery path from the retained task branch.
- After the clean bootstrap commit, call task_run_update with phase validating and drive \`no-mistakes axi run --intent "<the user's objective and approved tradeoffs>"\` plus every subsequent \`axi respond\` through checks-passed or a terminal outcome. Custody transfers only after \`no-mistakes axi run\` accepts the committed clean HEAD and reports an active run. No-mistakes then owns rebase, review fixes, subsequent commits, push, MR creation or update, every MR metadata or settings correction, and CI. Do not amend or replace the bootstrap commit or perform duplicate out-of-band Git or MR mutations.
- If \`no-mistakes axi run\` is unavailable or rejects the handoff before reporting an active run, retain parent custody, call task_run_update with phase validating, and use the normal direct-delivery path from the retained task branch. Preserve the required validation, review, MR configuration and verification, tracker action, and ready-for-review update.
- While no-mistakes is active, do not hand-edit its findings. Use axi respond so the pipeline owns fixes. Do not use --yes. For ask-user findings, call task_run_update with phase awaiting-decision and ask in this worker tab; after the answer, you—not the launcher—respond to the gate.
- If no-mistakes fails because it could not fetch or resolve the trusted default branch resolved from authoritative remote metadata and the output shows SSH-agent authentication was locked or denied, treat it as a recoverable decision wait rather than a completed implementation failure. Call task_run_update with phase awaiting-decision, ask the user to unlock or approve the credential, repeat the delivery preflight, then run \`no-mistakes rerun\`. Use phase failed only if the retry still fails for a non-recoverable reason.
- On checks-passed, verify the MR title, target, squash setting, and source-deletion setting. Route every correction through no-mistakes and do not record readiness until verification passes. Do not close the tracker item. For GitLab scoped-label mode, verify and apply the configured readyForReviewLabel, then rehydrate the issue. For mode none, do not read, infer, or mutate workflow labels. For Beads, leave the item open without inventing a tracker status.
- Only after the applicable ready-for-review tracker action succeeds, call task_run_update with phase ready-for-review and include the PR URL when available. On any other terminal failure after custody transfers, call task_run_update with phase failed and explain the retained recovery state.
- Never return the Treehouse lease or close the Zellij tab. They remain available for review and explicit recovery.
`;
}
