# Uber Go Style — Cheat Sheet

> Auto-loaded once per session when you first touch a `.go` file. These are the
> rules that shape how Go is written here. For deeper detail on any rule (full
> explanation + good/bad examples), call the `go_standard` tool with the section
> slug (e.g. `error-wrapping`) — it returns just that one section instead of the
> whole 87KB guide. House-specific additions live in `standards/rules/`.

## Receivers & interfaces
- Be consistent: if any method needs a pointer receiver, use pointer receivers for all of that type's methods.
- Verify interface compliance at compile time: `var _ http.Handler = (*Handler)(nil)`.
- Don't use pointers to interfaces — almost never needed.

## Slices, maps, nil
- `nil` is a valid, usable empty slice. Return `nil`, not `[]T{}`. Check `len(s) == 0`, not `s == nil`.
- Copy slices/maps received from or returned to callers if you retain/mutate them (defensive copy at boundaries).
- Pre-size when length is known: `make([]T, 0, n)` / `make(map[K]V, n)`.

## Control flow & structure
- Reduce nesting: handle errors/edge cases early and `return`/`continue`.
- No unnecessary `else` after a branch that returns.
- Use `&T{}`, not `new(T)`. Initialize structs with field names: `T{Name: x}`.
- Keep variable scope minimal. Prefer `:=` for locals.
- Use raw string literals (`` `...` ``) to avoid escaping.

## Concurrency
- Zero-value `sync.Mutex` is valid — don't init it. Don't embed it in exported structs.
- Channel size is 0 (unbuffered) or 1. Larger sizes need a documented reason.
- `defer` to release locks/resources, even though it has tiny overhead.

## Misc high-value
- Avoid `init()`; prefer explicit construction. Avoid mutable package-level globals.
- Use the `time` package for durations/instants — never raw `int` seconds.
- Use field tags on marshaled structs (`json:"name"`).
- Functional options for optional constructor params.

## Always
- Code must pass `gofmt` (or `goimports`) and `go vet`. This extension auto-checks edited files and reports violations.
