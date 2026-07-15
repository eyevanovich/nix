# bd 1.1 fixtures

These response shapes were captured from `bd` 1.1.0:

- `list.json` — `bd list --status open,in_progress,blocked --limit 100 --json` (array)
- `show.json` — `bd show demo-show --json` (array)
- `create.json` — `bd create --title "Created task" --description "Captured from bd create" --priority 2 --type task --json` (object)
- `update.json` — `bd update demo-updated --title "Updated task" --description "Captured from bd update" --status in_progress --priority 1 --type feature --json` (array)

IDs, owners, and timestamps were sanitized; payload structure and field names were retained.
