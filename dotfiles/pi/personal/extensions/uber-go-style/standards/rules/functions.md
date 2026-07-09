# Functions & Methods

- **Guard clauses first** — handle errors/edge cases with early return; reduce nesting.
- **No unnecessary `else`** — if both branches assign a variable, use default + override.
- **Handler as orchestrator** — entry-point methods delegate to private helpers, stay under ~30 lines.
- **Function ordering** — group by receiver, sorted by rough call order.
- **Functional options** — for constructors with 3+ optional params.
- **No useless private wrappers** — don't add a method that only forwards to another call with no logic; inline it.
- **No method/package-func name shadowing** — if an interface requires `Service.BuildFoo`, implement it directly on the method; don't keep a package-level `BuildFoo(...)` that the method just calls.
- **Free function vs. struct method** — a helper that only ever operates on one struct's data should be a method on that struct (alias receiver). Stateless helpers shared across types → package-level func. Externally-called stateless helpers → `util.go`.

## Variables & Scope

- **`:=` for locals**, `var` for package-level or zero-value.
- **Reduce scope** — declare close to use; prefer `if err := ...; err != nil`.
- **`nil` is a valid slice** — return `nil` not `[]int{}`, check `len(s) == 0` not `s == nil`.
- **Avoid mutable globals** — inject dependencies.
