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

The execution workflow reads `~/.pi/agent/task-picker.json`, linked by Home Manager from the active profile. Version 1 supports `gitlab.workStatus.mode` values `scoped-labels` and `none`. The personal profile verifies and applies its configured scoped labels; the work profile self-assigns without automated status mutation. Missing or invalid configuration stops before mutation rather than guessing a fallback.

## Usage

- `/tasks` — detect the available task tracker and open its task list
- `/beads-tasks` — explicitly open the Beads task list
- `/gitlab-issues` — explicitly open the GitLab issue list
- `ctrl+e` — detect the available tracker and open its task list
- `/execute-beads [bead-id-or-search ...]` — run the bundled Beads execution workflow
- `/execute-gitlab-issue <host/project#iid-or-url>` — run the bundled GitLab execution workflow
- `/task-prompt` — inspect a full workflow prompt from the current session branch (TUI)

Both execution workflows resolve the exact default branch before editing. They create a task branch only when work begins on that default branch; work already on a non-default, including long-lived, branch remains there. After validation and review, they create a task-scoped completion commit, push only the intended non-default branch, and verify the completion SHA on the remote before closing the tracker item. Missing or ambiguous destinations, unrelated outbound commits, rejected pushes, or failed verification leave the local commit intact and tracker open for resolution; force-pushing is prohibited. MR creation/updates and merging still require separate approval.

When both providers apply, `/tasks` and `ctrl+e` show a compact tracker chooser.
The selection is remembered by normalized Git repository root for the lifetime of
that Pi extension session, including nested directories in the same repository.
It is not written to disk or carried into a reloaded or replacement session.
Explicit `/beads-tasks` and `/gitlab-issues` commands bypass the chooser without
changing the remembered selection.

> **Note:** the managed `keybindings.json` reserves `ctrl+e` for task-picker by
> binding `tui.editor.cursorLineEnd` to `end` and `ctrl+end` only. This avoids a
> shortcut conflict while preserving line-end navigation. To rebind task-picker,
> edit the `pi.registerShortcut(...)` block in `extension.ts` — `/tasks`,
> `/beads-tasks`, and `/gitlab-issues` work regardless.

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

## Task execution

Starting work from the picker submits the selected tracker's bundled execution prompt in the current Pi session, which expands and runs `/execute-beads` or `/execute-gitlab-issue` normally. The workflow can use managed subagent worktrees for isolated implementation when appropriate; task-picker itself does not allocate worktrees or launch background terminals.

### Compact prompt display

On Pi versions supporting Markdown transformers (tested with 0.85.1), picker launches and manual `/execute-*` commands display a compact command/target summary. This is display-only: the agent receives the full workflow, and the session stores it unchanged. It does not reduce model tokens.

Use `/task-prompt` to inspect or copy the exact stored prompt. With multiple workflows, choose one from the newest-first list. The editor is an inspection buffer: submitting or cancelling it discards edits and sends nothing to the agent. It only reads the current session branch; queued follow-ups become inspectable after delivery. Older, unmarked prompts and Pi versions without the display hook retain their full display. Reload Pi after updating to enable the new renderer and templates.

### Bounded orchestration

- Ready tasks reuse their existing brief; triage is reserved for unresolved readiness or requirements. Tracker guards, approval, and checking for already-implemented behavior still apply.
- Blocking clarifications get a separate **Questions before I can start** turn: up to three plain-language questions, one decision each, explaining why an answer is needed, grounded choices where available, and a simple reply format. “Help me decide” leads to authorized read-only discovery, not guessed answers or secret requests. Remaining blockers stay visible.
- Only once blockers are resolved does **Ready for approval** summarize the outcome, likely changes, non-goals, success checks, roles, risks, and non-blocking assumptions. Clarification answers are not approval; the agent still asks `Execute this plan? yes/no/changes`. New blockers pause implementation, and changed scope needs renewed approval. Supporting evidence stays brief, with detailed logs available on request.
- Small, low-risk tasks with known files and checks use parent implementation followed by one fresh, independent review. Discovery agents are optional and answer only plan-changing unknowns.
- Native workers explicitly start with fresh context and a self-contained task packet: acceptance criteria, repo/cwd/ref, owned files, settled decisions, references, constraints, validation, and stop conditions. Forking requires a stated dependency on essential parent history. This policy is local to these workflows, not a global subagent setting; external runners retain their own contracts.
- Reviewers receive the actual diff and validation evidence. Follow-ups cover accepted fixes, unresolved findings, and regressions in the affected area, expanding only when evidence warrants it.

Model and reasoning choices remain in machine-local `~/.pi/agent/settings.json`, under `subagents.agentOverrides`; they are not embedded in these prompts. Compare representative completed tasks with `/subagent-cost` and run artifacts: parent plus child input/cache/output usage, latency, validation results, and rework. The prompt tests check workflow wording and size, not model compliance or measured token savings.

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
  The bundled Beads workflow owns target resolution, readiness checks, claiming,
  hydration, approval, execution, review, and closure; picker dispatch follows
  the behavior described above.
- The `execute-beads.md` and `execute-gitlab-issue.md` prompts are bundled under
  `prompts/` and contributed through Pi's resource discovery API, so picker and
  manual execution use the same workflows.
- GitLab work dispatch uses the canonical issue URL so self-managed hosts remain
  explicit. The workflow resolves the authenticated username without token output,
  preserves existing assignees, and follows the active profile's work-status mode.
  Scoped-label mode verifies configured labels and guards deferred work before
  mutation; none mode leaves status untouched. Completion uses native close.
- Editable task types include the bd 1.1 built-ins (`task`, `feature`, `bug`,
  `chore`, `epic`, and `decision`) plus unique values from `types.custom`.
- `bd` commands are serialized because its dolt backend cannot safely handle
  concurrent database access.
- Beads responses validate consumed fields before normalization, including issue
  IDs, labels, dependencies, and active blockers. Errors identify the command and
  field path without dumping the payload. Optional null metadata is treated as
  absent; extra fields are ignored. If create reports success but its response is
  invalid, a validated identity is retained for partial-create recovery when
  possible; otherwise inspect the created task before retrying.
- Typechecks against the Pi API version locked in the development dependencies.
