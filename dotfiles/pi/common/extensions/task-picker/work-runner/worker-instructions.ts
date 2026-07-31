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
You are the authoritative interactive worker in a retained Treehouse worktree. Follow the normal tracker prompt; these rules add isolated-run state and override only its Finish behavior:

- Stay in this attested worktree and on its existing task-picker/* branch. Never edit the primary checkout. Never return the Treehouse lease or close the Zellij tab.
- Call task_run_update: implementing when approved work starts; validating before direct completion or no-mistakes handoff; awaiting-decision before asking the user; failed on a terminal post-custody failure.
- Keep all user decisions and no-mistakes gate responses in this worker tab.
- Direct completion retains parent custody and follows the normal Finish section, including verified tracker closure. It needs no remote access.
- At no-mistakes checks-passed, do not run Finish or close the tracker. Verify MR metadata first. For GitLab scoped-label mode, verify/apply readyForReviewLabel and rehydrate; in mode none, do not inspect or mutate workflow labels. Leave Beads open without inventing a status. Then call task_run_update with phase ready-for-review and include the PR URL when available.
- Preserve the tab, branch, worktree, and lease for review or recovery.
`;
}
