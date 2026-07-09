# Uber Go Style Extension

Auto-detects Go projects and helps Pi write Go to the team's standards (the
[Uber Go Style Guide](https://github.com/uber-go/guide) plus growable house
additions) — with near-zero idle context cost.

## How it works

1. **Detection** — on `session_start` the extension checks for a `go.mod` (or
   any `.go` file) to show a startup notice (and optionally pre-arm). In
   non-Go work it stays silent.
2. **Arming on first Go touch** — the moment Pi reads/writes/edits **any** `.go`
   file, the extension arms. This works even in a brand-new repo with no
   `go.mod` yet. Touching non-Go files never arms it.
3. **Tiered injection** — rules are split into *core* and *contextual* tiers:
   - **Core** (errors, formatting, types, functions, layering) — appended to the
     **system prompt every turn** once armed, so they stay salient and don't
     decay over a long session. A one-time bridge message also covers the prompt
     where the first touch happened.
   - **Contextual** (database, concurrency, testing, AWS, conductor, performance,
     tooling) — injected **once** as a silent steer message the first time Pi
     touches a file whose path or content matches that topic's patterns (e.g.
     `database.md` fires when a repo/store file or SQL content is detected).
     Each topic is sent at most once per session.

   This keeps the system prompt lean and KV-cache-stable while still delivering
   the right rules exactly when they're needed. Controlled by `injectMode`.
4. **Post-edit lint** — after Pi writes/edits a `.go` file, available tools run
   on it and **only violations** are appended to the result so Pi can fix them.
   Clean files add nothing; missing tools are skipped silently.

### Injection modes (`injectMode`)

| Mode | First-touch prompt | Every prompt after | Notes |
|------|--------------------|--------------------|-------|
| `hybrid` *(default)* | covered by bridge message | core rules resident in system prompt | guaranteed coverage from the moment you touch Go |
| `system` | not covered (one-prompt late) | core rules resident in system prompt | most token-frugal; no duplicated block |
| `message` | covered by one-time message | decays in history | legacy behavior; no system-prompt change |

Set `armOnGoProject: true` to pre-arm at session start in an established Go
project (core standards resident from turn 1, before you touch any file).

## Rules live in markdown (growable)

All rules are plain markdown read at runtime — edit them without touching code:

| File | Tier | Purpose |
|------|------|---------|
| `standards/cheat-sheet.md` | core | Compact high-value Uber rules, always injected |
| `standards/rules/errors.md` | core | Error handling, sentinel visibility, `fmt.Errorf` vs `errors.New` |
| `standards/rules/formatting.md` | core | Whitespace, string concat, comments, imports, naming |
| `standards/rules/types.md` | core | Opaque types, structs, interfaces, `defs.go` pattern |
| `standards/rules/functions.md` | core | Guard clauses, method vs free func, variable scope |
| `standards/rules/layering.md` | core | CDI architecture, struct ownership, import direction |
| `standards/rules/database.md` | contextual | Squirrel chainable API, `sql.Null*` gotchas, transactions |
| `standards/rules/concurrency.md` | contextual | Mutex, channels, goroutine lifecycle |
| `standards/rules/testing.md` | contextual | Table-driven tests, JSON contract tests |
| `standards/rules/performance.md` | contextual | `strconv`, pre-sized slices/maps, hot-path rules |
| `standards/rules/aws.md` | contextual | S3 client region configuration |
| `standards/rules/conductor.md` | contextual | Conductor SDK enum values |
| `standards/rules/tooling.md` | contextual | CI setup, intentional lint deviations |
| `standards/rules/checklist.md` | contextual | Pre-merge checklist (injected by commands) |
| `standards/uber-go-style-full.md` | — | Full upstream Uber guide. Never injected; parsed into sections served one-at-a-time by the `go_standard` tool. Refresh with `curl -fsSL https://raw.githubusercontent.com/uber-go/guide/master/style.md -o standards/uber-go-style-full.md`. |

`standards/house-rules.md` is the **routing table index** — it documents which
file covers which topic and when it fires. To add a rule, edit the relevant
`standards/rules/<topic>.md` file. To add a new topic, create a new file and
add a row to `house-rules.md` and a `RuleRoute` entry in `src/index.ts`.

## Deep lookup: the `go_standard` tool

When a rule needs the authoritative text or examples, Pi calls `go_standard`
instead of loading the whole guide:

```
go_standard()                          # list every available section slug
go_standard(section="error-wrapping")  # return just that section + examples
```

Slugs match the guide's TOC anchors (e.g. `receivers-and-interfaces`,
`nil-is-a-valid-slice`, `prefix-unexported-globals-with-_`). Lookup falls back
from exact slug → substring slug → title match. A single section is typically
1–3KB versus the full 87KB guide.

## Linting

After each `.go` edit/write the extension runs the enabled tools:

| Tool | Default | Notes |
|------|---------|-------|
| `gofmt -l/-d` | **on** | Fast formatting check; reports a diff |
| `go vet ./...` | off | Slower; runs on the file's package |
| `golangci-lint run` | off | Auto-skips if not installed |

Only failures are surfaced. Tools that aren't installed are silently skipped.

## Configuration

`~/.pi/agent/uber-go-style.json` is created with defaults on first run:

```json
{
  "enabled": true,
  "injectStandards": true,
  "injectMode": "hybrid",
  "armOnGoProject": false,
  "lint": {
    "gofmt": true,
    "goVet": false,
    "golangciLint": false,
    "timeoutMs": 15000
  }
}
```

## Commands

- `/go-standards` — force-inject all unsent contextual topics for the current
  session and show the full standards (core + all contextual + checklist).
- `/go-standards-scan [--base <branch>] [--fix]` — scan this branch's Go changes
  against a base branch for standards violations.

### `/go-standards-scan`

Compares the changed `.go` files between the merge-base of `<branch>` and `HEAD`,
runs the configured linters on each, and hands the diff + lint findings + the
full standards to the agent for a judgment pass (the rules linters can't check —
error wrapping, receiver consistency, naming, nil slices, `panic` in libs, etc.).

| Flag | Default | Meaning |
|------|---------|---------|
| `--base <branch>` | `main` | Base branch to compare against. Resolves `<branch>` then `origin/<branch>`. Use `--base v2` for the v2 line. A bare branch name also works. |
| `--fix` | off | Apply fixes immediately (edits files; auto-re-lints). Without it, report-only. |

Examples:

```
/go-standards-scan                 # changes vs main, report-only
/go-standards-scan --base v2       # changes vs v2, report-only
/go-standards-scan --base v2 --fix # changes vs v2, fix in place
/go-standards-scan v2 --fix        # bare branch name, fix in place
```
