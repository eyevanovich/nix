# Upstream pi-beads: worthwhile task-picker updates

## Scope and conclusion

Reviewed upstream package snapshot [`707f666ed4918814a6aaf139e9d99d9bea2aa234`](https://github.com/edmundmiller/dotfiles/tree/707f666ed4918814a6aaf139e9d99d9bea2aa234/packages/pi-packages/pi-beads), the latest package-changing commit returned by GitHub during this review. Compared against our task-picker at [`4dbb034`](https://github.com/eyevanovich/nix/tree/4dbb034660c9420349416be561a0c2b49d7995cc/dotfiles/pi/common/extensions/task-picker).

**Borrow individual ideas, not the package wholesale.** The main new user-facing feature is clipboard-based task preselection. Extension wiring tests and per-record JSON validation are also useful. Our provider integration, mutation safety, task context, responsive layout, and approval/review/delivery workflows should remain intact. [U1], [U2], [U3], [U4], [L1], [L2], [L3], [L4]

This was source review, not an upstream installation or benchmark. No upstream code was executed and no real clipboard was read. Plugin behavior was not changed.

## Worth adopting

### 1. Exact-reference preselection — best UX addition

Upstream reads the clipboard when opening the browser, extracts tokens, and preselects the first exact match in the already-loaded task refs. It passes `initialSelectedRef` to the list; missing matches or clipboard errors simply open the normal list. Selection does **not** start work. Tests cover known/unknown refs, dotted child refs, and clipboard failure. The README does not describe this addition; the source and tests do. [U1], [U2], [U4], [U7]

Our list remembers selection while navigating within one browser invocation, but has no initial-reference input. Our registered task commands currently ignore their arguments. [L1], [L2]

**Suggested adaptation, not existing upstream behavior:**

- Support `/tasks <ref-or-url>` as an explicit jump to a task.
- Make clipboard-assisted selection opt-in or an explicit action rather than reading the clipboard every time.
- Match only tasks in the selected provider/project. For GitLab, require a canonical project-scoped ref or issue URL; a bare `#42` must not select across projects.
- Preserve normal selection if the reference is absent from the loaded list; ask or decline to preselect when multiple distinct matches are ambiguous.
- Only change selection: no claiming, status mutation, prompt submission, or execution. Do not log, persist, or send clipboard contents to the model.

This fits the existing list component with a small input seam. It does not justify replacing tracker routing or importing upstream's dependency stack. [U1], [U4], [L1], [L2]

### 2. Extension-level wiring tests — best engineering addition

Upstream injects the clipboard reader, backend, list renderer, and form renderer. Its harness invokes the registered command, captures list callbacks, then drives form `onSave` and checks backend arguments. This tests the wiring between pieces, not only each piece independently. [U1], [U2]

We already have substantial adapter, rendering, routing, prompt, and mutation tests. The useful gap is narrower: the partial-create retry test exercises `createTaskSaveSession`, while the live browser's nested `createTask` contains separate save/retry logic. That is an opportunity for implementation and tests to drift, not evidence that the current retry behavior is broken. [L1], [L5]

**Suggested adaptation:** add injectable list/form renderers alongside the existing provider injection, then exercise the actual registered command through create/edit/save/start-work callbacks. Prioritize partial-create recovery, provider-specific field restrictions, error reporting, and busy-session follow-up dispatch. Keep the real TUI tests; a mocked renderer cannot prove keyboard or layout behavior. Use our existing Node test runner rather than importing the Bun-specific harness verbatim. [U2], [L1], [L5], [L6]

### 3. Runtime record validation — small reliability improvement

Upstream's `parseIssueList` verifies both its response envelope and each issue's `id`, `title`, and `status` string fields before normalization. Our Beads parsers check array/object containers, then cast their contents to TypeScript types without validating individual records. We already test malformed JSON and wrong containers, so this is additional record-level coverage, not a missing parser altogether. [U3], [L3], [L7]

A read-only synthetic probe against our adapter returned a task with `ref === undefined` when mocked `bd list` output was:

```json
[{ "title": "Synthetic row missing its ID", "status": "open" }]
```

The probe supplied valid mocked custom-type configuration and an empty blocked list; no `bd` process or database was touched. This demonstrates an input-validation gap, not evidence that the installed CLI normally emits malformed rows.

**Suggested adaptation:** validate required issue fields and consumed nested fields such as blocker refs before normalization, with errors identifying the command and invalid record. Add missing-ID, null-row, wrong-field-type, and malformed-blocker tests. Preserve our `bd` 1.1 response shapes and strict rejection of unknown statuses; do not copy upstream's `br` envelope or its fallback of unknown statuses to `open`. Allow unrelated extra fields for forward compatibility. [U3], [L3], [L7]

## Keep ours / do not port wholesale

- **CLI and API compatibility:** upstream now invokes `br` and imports `@mariozechner/pi-*`; ours targets `bd` 1.1 and `@earendil-works/pi-*`. Upstream expects an object with an `issues` array for list results; our recorded `bd` fixtures use an array. A `br` migration is a separate decision, not a task-picker update. [U3], [U5], [L3], [L7]
- **Mutation safety:** upstream updates the displayed task immediately and fires `void config.onUpdateTask(...)` without awaiting it there. Ours coordinates mutations, applies the visible update after persistence, and reports failures. Copying that UI code would weaken our behavior. [U4], [L2]
- **Execution policy:** upstream sends a short `Work on task ...` message with task context. Replacing our bundled execution flow with it would omit the explicit approval, independent review, and verified-push-before-closure instructions we added. [U6], [L1], [L8]
- **Hydration and rich context:** upstream reuses a list task for editing whenever its description is present. We always hydrate edit details and preserve active blocker information. Retain that behavior. [U1], [L1]
- **Layout and data handling:** upstream uses a fixed minimum list area and seven-line preview, while ours budgets terminal height and uses ANSI/display-width-aware wrapping. We also retain natural child-ID sorting, custom task types, and a serialized command queue within each Beads adapter instance. [U3], [U4], [L2], [L3]

## Recommended order

For a visible improvement, start with explicit exact-reference preselection, with wiring tests in the same change. Clipboard support can follow after deciding its opt-in behavior and GitLab reference rules. Record-level CLI validation is independently useful and can be implemented without changing the UX. These are recommendations, not approved implementation work.

## Sources

All source links are pinned to the reviewed upstream or local commit.

[U1]: https://github.com/edmundmiller/dotfiles/blob/707f666ed4918814a6aaf139e9d99d9bea2aa234/packages/pi-packages/pi-beads/src/extension.ts
[U2]: https://github.com/edmundmiller/dotfiles/blob/707f666ed4918814a6aaf139e9d99d9bea2aa234/packages/pi-packages/pi-beads/src/extension.test.ts
[U3]: https://github.com/edmundmiller/dotfiles/blob/707f666ed4918814a6aaf139e9d99d9bea2aa234/packages/pi-packages/pi-beads/src/backend/adapters/beads.ts
[U4]: https://github.com/edmundmiller/dotfiles/blob/707f666ed4918814a6aaf139e9d99d9bea2aa234/packages/pi-packages/pi-beads/src/ui/pages/list.ts
[U5]: https://github.com/edmundmiller/dotfiles/blob/707f666ed4918814a6aaf139e9d99d9bea2aa234/packages/pi-packages/pi-beads/package.json
[U6]: https://github.com/edmundmiller/dotfiles/blob/707f666ed4918814a6aaf139e9d99d9bea2aa234/packages/pi-packages/pi-beads/src/lib/task-serialization.ts
[U7]: https://github.com/edmundmiller/dotfiles/blob/707f666ed4918814a6aaf139e9d99d9bea2aa234/packages/pi-packages/pi-beads/README.md
[L1]: https://github.com/eyevanovich/nix/blob/4dbb034660c9420349416be561a0c2b49d7995cc/dotfiles/pi/common/extensions/task-picker/extension.ts
[L2]: https://github.com/eyevanovich/nix/blob/4dbb034660c9420349416be561a0c2b49d7995cc/dotfiles/pi/common/extensions/task-picker/ui/pages/list.ts
[L3]: https://github.com/eyevanovich/nix/blob/4dbb034660c9420349416be561a0c2b49d7995cc/dotfiles/pi/common/extensions/task-picker/backend/adapters/beads.ts
[L4]: https://github.com/eyevanovich/nix/blob/4dbb034660c9420349416be561a0c2b49d7995cc/dotfiles/pi/common/extensions/task-picker/README.md
[L5]: https://github.com/eyevanovich/nix/blob/4dbb034660c9420349416be561a0c2b49d7995cc/dotfiles/pi/common/extensions/task-picker/test/pure-behavior.test.ts
[L6]: https://github.com/eyevanovich/nix/blob/4dbb034660c9420349416be561a0c2b49d7995cc/dotfiles/pi/common/extensions/task-picker/test/routing-capability.test.ts
[L7]: https://github.com/eyevanovich/nix/blob/4dbb034660c9420349416be561a0c2b49d7995cc/dotfiles/pi/common/extensions/task-picker/test/beads-adapter.test.ts
[L8]: https://github.com/eyevanovich/nix/blob/4dbb034660c9420349416be561a0c2b49d7995cc/dotfiles/pi/common/extensions/task-picker/prompts/execute-beads.md
