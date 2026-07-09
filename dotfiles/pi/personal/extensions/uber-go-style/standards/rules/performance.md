# Performance (Hot Paths Only)

- **`strconv.Itoa(n)`** not `fmt.Sprint(n)` (~2× faster).
- **No `fmt.Sprintf` in hot loops** — use string concat + `strconv`.
- **Slice capacity**: `make([]T, 0, n)` when size is known (~10× faster than growing).
- **Map capacity**: `make(map[K]V, n)` when size is known.
- **Byte conversion**: `[]byte("str")` done once outside loops.

These rules apply to hot paths only. Outside hot paths, `fmt.Sprintf` is fine for readability.
