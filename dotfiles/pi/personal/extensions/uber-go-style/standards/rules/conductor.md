# Conductor SDK

- **Use SDK enum values, not string literals** — for conductor task types use `workflow.FORK_JOIN`, `workflow.JOIN`, `workflow.FORK_JOIN_DYNAMIC` (from `sdk/workflow`), cast to string when comparing against the runtime `model.Task.TaskType`.
- Only hand-roll a named const when the runtime value has no SDK enum (e.g. the `"FORK"` execution type); document why with a comment.
