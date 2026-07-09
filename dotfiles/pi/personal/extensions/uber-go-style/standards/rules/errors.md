# Errors

- **`errors.Is`** — use instead of `== sql.ErrNoRows` etc.
- **`errors.New` for static strings** — no format verbs → `errors.New("msg")` not `fmt.Errorf("msg")` (~3× faster).
- **Wrap with `%w`** — `fmt.Errorf("context: %w", err)` to preserve unwrapping.
- **Error strings** — lowercase, no trailing punctuation.
- **Handle exactly once** — don't log *and* return an error.
- **Don't `panic` in library code** — return errors; `panic` only for truly unrecoverable state.
- **Sentinel errors**: export only if a consumer does `errors.Is(err, pkg.ErrX)`. If the caller merely checks `err == nil` or wraps it opaquely, keep it unexported (`errNotFound`).

## `fmt.Errorf` only for `%w` wrapping; otherwise `errors.New` + concat

Reserve `fmt.Errorf` for the single case where you wrap with `%w`. Use `errors.New` + concat for everything else.

| Situation | Use |
|---|---|
| Static error, no vars | `errors.New("msg")` |
| Error with vars, no wrapping | `errors.New("msg " + s)` |
| Error with wrapping | `fmt.Errorf("msg %s: %w", s, err)` |

- **Never concat into the format string when wrapping** — `fmt.Errorf("x["+s+"]: %w", err)` uses more memory than `fmt.Errorf("x[%s]: %w", s, err)`.
