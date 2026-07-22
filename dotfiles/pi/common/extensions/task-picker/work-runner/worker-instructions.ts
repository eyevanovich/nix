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

The normal tracker execution workflow still owns task resolution, guards, planning, explicit approval, implementation, parent inspection, and independent review. The following rules override only its delivery and Finish behavior for this isolated run:

- Stay in the current attested worktree and on its existing task-picker/* branch. Never edit the primary checkout.
- Do not implement before the normal workflow receives explicit approval. After approval, verify unattended delivery credentials with \`git ls-remote --exit-code origin HEAD\` before changing files. If it fails because an SSH agent such as Secretive is locked, unavailable, or denied, call task_run_update with phase awaiting-decision, ask the user to unlock or approve it in this worker tab, and retry the same preflight. Do not begin implementation until it succeeds.
- After delivery preflight succeeds, call task_run_update with phase implementing. Implementation subagents must not commit or publish. After integrating and reviewing approved work, you own the task-scoped commit on this branch.
- Immediately before validation, repeat \`git ls-remote --exit-code origin HEAD\`. Resolve an authentication wait exactly as above; do not start a no-mistakes run that is already unable to fetch trusted main.
- After committing and successful delivery preflight, call task_run_update with phase validating and drive the installed no-mistakes CLI yourself. Use the user's task objective as --intent. You own every no-mistakes axi run and axi respond call through checks-passed or a terminal outcome.
- While no-mistakes is active, do not hand-edit its findings. Use axi respond so the pipeline owns fixes. Do not use --yes. For ask-user findings, call task_run_update with phase awaiting-decision and ask in this worker tab; after the answer, you—not the launcher—respond to the gate.
- If no-mistakes fails because it could not fetch or resolve the trusted default branch and the output shows SSH-agent authentication was locked or denied, treat it as a recoverable decision wait rather than a completed implementation failure. Call task_run_update with phase awaiting-decision, ask the user to unlock or approve the credential, repeat the delivery preflight, then run \`no-mistakes rerun\`. Use phase failed only if the retry still fails for a non-recoverable reason.
- On checks-passed, do not close the tracker item. For GitLab scoped-label mode, verify and apply the configured readyForReviewLabel, then rehydrate the issue. For mode none, do not read, infer, or mutate workflow labels. For Beads, leave the item open without inventing a tracker status.
- Only after the applicable ready-for-review tracker action succeeds, call task_run_update with phase ready-for-review and include the PR URL when available. On any other terminal failure, call task_run_update with phase failed and explain the retained recovery state.
- Never return the Treehouse lease or close the Zellij tab. They remain available for review and explicit recovery.
`;
}
