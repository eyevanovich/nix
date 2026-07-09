# Concurrency

- **`var mu sync.Mutex`** — zero-value is valid, no `new(sync.Mutex)`.
- **Unexported mutex** — never embed (leaks `Lock`/`Unlock` to the API).
- **Channel size** — 0 or 1; larger sizes need a documented reason.
- **No fire-and-forget goroutines** — always track lifecycle with context/WaitGroup/errgroup.
- **Copy slices/maps at boundaries** — prevent callers from mutating internal state.
- **`defer`** to release locks/resources.
