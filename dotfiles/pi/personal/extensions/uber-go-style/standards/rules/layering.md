# Layering & Consumer-Defined Interfaces (CRITICAL)

Architecture: **repo → service → controller**. Each layer defines the interface it *consumes*; the lower layer conforms to it. Imports point *up*, never down.

```
repo  ──imports──▶  service  ──imports──▶  controller
(domain structs)    (converts repo→ctrl)   (interface + json structs)
```

## Consumer-Defined Interfaces (CDI)

- The **service** defines the `repository` interface it needs. The repo does NOT define its own.
- The **controller** defines the `service` interface it needs. The service does NOT define its own.
- Defining an interface in the *producer* and having the consumer import it breaks CDI and creates cyclic dependencies.

## Struct ownership per layer

- **Controller** — public types, `json` tags, in `defs.go`. Owns the API contract.
- **Service** — domain types, no `json` tags. Converts repo output → controller types. Never passes repo structs through.
- **Repository** — private structs, no `json` tags. Returns domain types owned by the service layer.

## Identity-shaped types still duplicate (no DRY exception)

Even when domain shape and API shape are identical, **duplicate the struct and convert**. `json` tags live only in the controller:

```go
// controller/defs.go — json tags here ONLY
type Summary struct {
    E2EID    int    `json:"e2e_id"`
    Name     string `json:"name"`
    RunCount int    `json:"run_count"`
}

// service — no json tags; service maps repo → controller type
type Summary struct {
    E2EID    int
    Name     string
    RunCount int
}
```

Add JSON contract tests in the controller (see `rules/testing.md`).

## Reference wiring

- **Controller `defs.go`**: owns the `service` interface AND the json-tagged structs. Interface methods return controller types, take primitives as inputs.
- **Service `service.go`**: imports the controller (aliased as `ctrl`); converts with small `mapType` helpers.
- **Service `defs.go`**: owns the `repository` interface + domain structs (no json tags).
- **Repo**: imports the service for domain types.

**Gotchas:**
- JSON contract tests belong in the **controller** package — if they import the service you get an import cycle.
- Fields the wire contract drops don't exist on the controller struct; the map helper omits them.
- Controllers expose `Register(app fiber.Router)` — not `Boot` or other names.
