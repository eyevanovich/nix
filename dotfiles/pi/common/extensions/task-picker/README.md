# pi-task-picker

Tracker-neutral task picker for Pi with [Beads (bd)](https://github.com/steveyegge/beads) and GitLab providers.

Ported from [edmundmiller/pi-beads](https://github.com/edmundmiller/dotfiles/tree/main/packages/pi-packages/pi-beads)
(itself a fork of [@soleone/pi-tasks](https://github.com/Soleone/pi-tasks)) to the
`@earendil-works/pi-coding-agent` API.

## Beads provider requirements

- `bd` CLI in PATH (requires bd 1.1)
- `.beads/` directory in the project (run `bd init` once)

The interactive browser opens only in Pi TUI mode. Each invocation checks the
active session directory for `.beads/` and verifies that `bd` is available before
loading tasks. Missing prerequisites are reported without entering the browser.

## GitLab provider requirements

- `glab` CLI in PATH and authenticated for the repository host
- A Git repository whose current project can be resolved by `glab repo view`

The GitLab provider lists every open project issue with explicit pagination. It supports creating issues, editing title and description, and closing or reopening. Labels, assignees, milestone, weight, due date, web URL, and issue type are display-only in the picker. GitLab-specific priority and type controls are intentionally absent.

## Usage

- `/tasks` — detect the available task tracker and open its task list
- `/beads-tasks` — explicitly open the Beads task list
- `/gitlab-issues` — explicitly open the GitLab issue list
- `ctrl+e` — detect the available tracker and open its task list
- `/execute-beads [bead-id-or-search ...]` — run the bundled Beads execution workflow
- `/execute-gitlab-issue <host/project#iid-or-url>` — run the bundled GitLab execution workflow

When both providers apply, `/tasks` and `ctrl+e` show a compact tracker chooser.
The selection is remembered by normalized Git repository root for the lifetime of
that Pi extension session, including nested directories in the same repository.
It is not written to disk or carried into a reloaded or replacement session.
Explicit `/beads-tasks` and `/gitlab-issues` commands bypass the chooser without
changing the remembered selection.

> **Note:** pi has no conflict-free `ctrl+<letter>` left — every non-control-code
> letter is bound by either the app or the emacs-style editor. `ctrl+e` overrides
> the editor's *cursor-to-line-end*; the extension wins the binding, and the
> **End** key still jumps to line-end, so the loss is negligible. To rebind, edit
> the `pi.registerShortcut(...)` block in `extension.ts` — `/tasks` and `/beads-tasks` work
> regardless.

## Keybindings

**List view**

| Key | Action |
|-----|--------|
| Configured `tui.select.up` / `tui.select.down` keys, `w` / `s` | Navigate |
| `space` | Cycle tracker-supported status |
| `0`–`4` | Set priority when supported (Beads) |
| `t` | Cycle type when supported (Beads) |
| `e` / `→` | Edit tracker-supported fields |
| Configured `tui.select.confirm` keys | Run the selected tracker's bundled execution workflow |
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
standard TUI actions. Like Pi 0.80's `KeybindingsManager`, a configured key may
match more than one action. The browser resolves such collisions by its documented
input order (for example, up before down and submit before tab); help shows the key
only for the first reachable action in the current view. The `w` / `s` navigation
aliases and browser-specific action keys remain fixed.

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

The adapter tests use fake Pi command executors, so validation does not require
`bd`, `glab` credentials, a `.beads/` directory, or a live GitLab project.

## Security

All tracker commands use argv arrays with no shell interpolation. The extension never reads or displays GitLab tokens and relies on `glab` for authentication. Issue content, project paths, labels, and usernames are always passed as separate argv values.

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
  Starting work closes the list immediately and submits `/execute-beads <task-id>`.
  The bundled workflow owns target resolution, readiness checks, claiming,
  hydration, approval, execution, review, and closure.
- The `execute-beads.md` and `execute-gitlab-issue.md` prompts are bundled under
  `prompts/` and contributed through Pi's resource discovery API, so picker and
  manual execution use the same workflows.
- GitLab work dispatch uses the canonical issue URL so self-managed hosts remain
  explicit. The workflow resolves the authenticated username without token output,
  preserves existing assignees, verifies the existing `status::in-progress` label,
  and applies it before plan approval. Starting a `status::deferred` issue requires
  an explicit confirmation; completion uses the native closed issue state.
- Editable task types include the bd 1.1 built-ins (`task`, `feature`, `bug`,
  `chore`, `epic`, and `decision`) plus unique values from `types.custom`.
- `bd` commands are serialized because its dolt backend cannot safely handle
  concurrent database access.
- Typechecks against the Pi API version locked in the development dependencies.
