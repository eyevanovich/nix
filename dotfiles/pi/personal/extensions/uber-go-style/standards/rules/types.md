# Types, Structs & Interfaces

## Constructor-enforced types ("classes")

Expose an exported alias to an **unexported** pointer struct; force construction through `New()`.

```go
type Thing = *thing

type thing struct{ dep Dependency }

func New(dep Dependency) Thing {
    return &thing{dep: dep}
}
```

- All methods use the alias receiver: `func (t Thing) ...` — not `(t *thing)`.
- **Never return interfaces from constructors** — return the concrete alias.
- **Alias is already a pointer — never write `*Alias`.** Adding `*` makes a double pointer `**x`; the build breaks with "type X has no field or method …".

## Structs

- **Field names always**: `Foo{X: 1}` not `Foo{1}`.
- **`var x Foo`** for zero-value structs, not `x := Foo{}`.
- **`&T{}`** not `new(T)` for struct references.
- **Embedded types** at top of field list, blank line before regular fields.
- **No public embedding** — use explicit delegation.
- **Field tags on marshaled structs** — always `json:"field_name"`.

## Interfaces

- **Compile-time checks**: `var _ Interface = (*Type)(nil)` — only for interfaces the type legitimately owns. Do NOT pin a producer to a consumer-defined interface.
- **Interface routing**: `switch` with 4+ cases → extract to interface + registry.
- **`MarshalJSON`/`UnmarshalJSON` on a named type** — not a free `MarshalFoo` utility.

```go
// GOOD
type Topology []Edge
func (t Topology) MarshalJSON() ([]byte, error) {
    if len(t) == 0 {
        return []byte("null"), nil
    }
    return json.Marshal([]Edge(t))
}

// BAD
func MarshalEdges(edges []Edge) *string { ... }
```

## `defs.go` pattern

`defs.go` holds the package's *declarative contract surface*:
- Consumer-defined interfaces
- Public / DTO structs (with `json` tags and any `MarshalJSON`/`UnmarshalJSON`)
- Constants and sentinel errors

The **opaque implementation struct does NOT live in `defs.go`** — `type X = *x` and the private struct belong in the impl file, next to the methods. The constructor (`New`) may stay in `defs.go`.

```go
// defs.go
type analyzer interface { Analyze(ctx context.Context, req Request) (Result, error) }
type AnalysisRequest struct { WorkflowID string `json:"workflow_id"` }
var ErrDuplicateEnqueue = errors.New("...")

// handler.go
type handler struct { svc analyzer; log *slog.Logger }
type Handler = *handler
func (h Handler) Handle(...) { ... }
```
