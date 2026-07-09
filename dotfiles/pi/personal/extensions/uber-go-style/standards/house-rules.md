# House Go Standards — Index

> Project-specific Go standards layered on top of the Uber Go Style Guide.
> When a rule here conflicts with Uber's guide, **the rule here wins**.
>
> Rules are split into topic files under `standards/rules/` for context efficiency.
> The extension injects **core** topics into every Go session and loads
> **contextual** topics on demand when relevant files are touched.

## Routing Table

| Topic file | Tier | Injected when |
|---|---|---|
| `rules/errors.md` | core | always (first `.go` touch) |
| `rules/formatting.md` | core | always (first `.go` touch) |
| `rules/types.md` | core | always (first `.go` touch) |
| `rules/functions.md` | core | always (first `.go` touch) |
| `rules/layering.md` | core | always (first `.go` touch) |
| `rules/database.md` | contextual | path matches `repo`/`store`/`repository`, or content contains `squirrel`/`sql.` |
| `rules/concurrency.md` | contextual | content contains `goroutine`/`sync.`/`chan `/ `go ` keyword usage |
| `rules/testing.md` | contextual | path ends in `_test.go` |
| `rules/performance.md` | contextual | path matches `hot`/`perf`, or content contains benchmark markers |
| `rules/aws.md` | contextual | path matches `aws`/`s3`, or content contains `s3.NewFromConfig` |
| `rules/conductor.md` | contextual | path matches `conductor`/`workflow`, or content contains `workflow.FORK` |
| `rules/tooling.md` | contextual | path matches `Makefile`/`ci`/`.github`, or explicit `/go-standards` command |
| `rules/checklist.md` | contextual | explicit `/go-standards` command or `/go-standards-scan` |

## Adding rules

Edit the relevant topic file. Keep entries short and imperative — every line
costs context tokens. If a new domain doesn't fit an existing file, add a new
`rules/<topic>.md` and add a row to the routing table above.
