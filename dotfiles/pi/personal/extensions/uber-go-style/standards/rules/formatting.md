# Formatting & Style

## Vertical whitespace between logical groups

Always add a blank line after a closing `}` or `)` before the next statement.
Group related lines, then blank line before the next step (setup → loop → transform → return).

```go
// BAD
func sortedKeys(m map[string]Config) []string {
    keys := make([]string, 0, len(m))
    for k := range m {
        keys = append(keys, k)
    }
    sort.Strings(keys)
    return keys
}

// GOOD
func sortedKeys(m map[string]Config) []string {
    keys := make([]string, 0, len(m))

    for k := range m {
        keys = append(keys, k)
    }

    sort.Strings(keys)

    return keys
}
```

**Exceptions** (no blank line needed):
- `}` is the last statement in its enclosing block
- `}` is immediately followed by another `}` (closing outer block)
- `)` is immediately followed by `{` (e.g. `if cond(\n) {`)
- `)` is immediately followed by `(` (chaining calls)

## Prefer string concatenation over `fmt.Sprintf`

Don't use `fmt.Sprintf` to assemble strings — use `+` concat + `strconv`.

```go
// BAD (~60 ns/op, 3 allocs)
msg := fmt.Sprintf("user %s has %d items", name, count)

// GOOD (~27 ns/op, 2 allocs)
msg := "user " + name + " has " + strconv.Itoa(count) + " items"
```

## Comments: concise and purposeful

Don't restate what the code does — explain *why* when it isn't obvious.

- Package, type, and exported-function doc-comments are required — one or two sentences.
- Inside functions, only comment non-obvious decisions or invariants.
- No inline comments that echo the statement (`i++ // increment i`).

## Imports

Two groups: stdlib first, blank line, then everything else. `goimports` handles this.

```go
import (
    "context"
    "fmt"

    sq "github.com/Masterminds/squirrel"
    "gitlab.disney.com/skywalker-sound/avs/..."
)
```

## Naming

- **Packages**: lowercase, no underscores, not plural, not `util`/`common`.
- **Unexported globals**: prefix `_` (e.g. `_defaultPort`). Exception: `err` prefix for errors.
- **Printf-style functions**: suffix `f` (e.g. `Wrapf`).
- **Exported identifiers**: `MixedCaps`. Don't stutter (`http.HTTPServer` → `http.Server`).
- **`iota` enums**: start at 1 unless zero is a meaningful default.
