# pi-beads

pi extension for [beads (bd)](https://github.com/steveyegge/beads) task management.

Ported from [edmundmiller/pi-beads](https://github.com/edmundmiller/dotfiles/tree/main/packages/pi-packages/pi-beads)
(itself a fork of [@soleone/pi-tasks](https://github.com/Soleone/pi-tasks)) to the
`@earendil-works/pi-coding-agent` API.

## Requirements

- `bd` CLI in PATH (requires bd 1.1)
- `.beads/` directory in the project (run `bd init` once)

The interactive browser opens only in Pi TUI mode. Each invocation checks the
active session directory for `.beads/` and verifies that `bd` is available before
loading tasks. Missing prerequisites are reported without entering the browser.

## Usage

- `/beads-tasks` — open the task list
- `ctrl+e` — also opens the task list

> **Note:** pi has no conflict-free `ctrl+<letter>` left — every non-control-code
> letter is bound by either the app or the emacs-style editor. `ctrl+e` overrides
> the editor's *cursor-to-line-end*; the extension wins the binding, and the
> **End** key still jumps to line-end, so the loss is negligible. To rebind, edit
> the `pi.registerShortcut(...)` block in `extension.ts` — `/beads-tasks` works
> regardless.

## Keybindings

**List view**

| Key | Action |
|-----|--------|
| Configured `tui.select.up` / `tui.select.down` keys, `w` / `s` | Navigate |
| `space` | Cycle status (open → in-progress → blocked → deferred → closed) |
| `0`–`4` | Set priority |
| `t` | Cycle type |
| `e` / `→` | Edit task |
| Configured `tui.select.confirm` keys | Claim task and send it to the work prompt |
| Configured `tui.input.tab` keys | Insert task ref and close |
| `c` | Create task |
| `f` | Search/filter |
| `j` / `k` | Scroll description |
| Configured `tui.select.cancel` keys | Back / clear filter |
| `ctrl+x` | Close browser |

**Edit view**

| Key | Action |
|-----|--------|
| Configured `tui.input.tab` keys | Switch focus / save description |
| Configured `tui.input.submit` keys | Save |
| Configured `tui.input.newLine` keys | Insert a description newline |
| Configured `tui.select.cancel` keys | Back to nav |
| `ctrl+x` | Close browser |

The browser reads Pi's effective `~/.pi/agent/keybindings.json` mappings for these
standard TUI actions. The `w` / `s` navigation aliases and browser-specific action
keys remain fixed.

## Development

Install the locked development dependencies, then run the combined validation:

```sh
npm ci
npm run check
```

The individual checks are also available:

```sh
npm run typecheck
npm test
```

The adapter tests use a fake Pi command executor, so validation does not require
`bd`, a `.beads/` directory, or a project database.

## Security

All shell-out goes through `bd` with arguments passed as an argv array (no shell
interpolation, no command injection). No network access, no filesystem writes
outside what `bd` itself does, no dynamic code evaluation. Audited on port.

## Notes

- The browser loads active work with one `bd list` query for exactly `open`,
  `in_progress`, and `blocked`, then one `bd blocked --json` query to attach exact
  active blocker refs. Deferred and closed tasks are intentionally absent.
- The list view shows at most 10 tasks and remains scrollable. On shorter terminals
  it reduces the visible task rows to fit; on taller terminals it expands the
  selected task's description preview instead. Create and edit forms follow the
  same responsive-height policy: their description editor grows on tall terminals,
  while optional read-only edit context yields before controls on short terminals.
  When a focused form becomes compact, its active editor and footer help take
  priority over inactive fields and header chrome.
- Dependency-blocked rows keep their stored status symbol and add `blocked:N`.
  Starting work closes the list immediately, then atomically claims the selected
  issue before hydrating it with `bd show`. Re-entering an issue already owned by
  the same actor is idempotent; a competing owner or any other claim failure is
  reported as an error and prevents hydration and prompt submission. Successful
  work prompts retain rich task context and actionable blocker IDs.
- Beads context setup remains explicit and session-level: run `bd prime` yourself
  when needed. The browser neither runs nor injects it, and task-specific work
  prompts remain separate from `/execute-beads`.
- Editable task types include the bd 1.1 built-ins (`task`, `feature`, `bug`,
  `chore`, `epic`, and `decision`) plus unique values from `types.custom`.
- `bd` commands are serialized because its dolt backend cannot safely handle
  concurrent database access.
- Typechecks against the Pi API version locked in the development dependencies.
