# Database (Squirrel)

**Always use the chainable API** — never `ToSql()` + separate exec:

```go
// GOOD
rows, err := Select("id", "name").
    From(db.UsersTable).
    Where(Eq{db.UsersColActive: 1}).
    RunWith(dbConn).
    QueryContext(ctx)

// BAD
query, args, err := sq.Select(...).ToSql()
rows, err := db.QueryContext(ctx, query, args...)
```

- **Dot-import Squirrel** — `import . "github.com/Masterminds/squirrel"` so it reads `Select(...)`, `Eq{...}` without the `sq.` prefix.
- **Import the db constants package as `db`** — not `dbpkg` or other aliases.
- **Use db constants for every table and column** — `db.JobAnalysisTable`, `db.JobAnalysisColJobName`. No raw SQL string literals.
- **No raw multi-line SQL strings** — build even complex queries with Squirrel; use `Expr(...)` for computed columns.

## sql.Null* integer types — always assert int64

`sql.NullInt32.Value()` and `sql.NullInt16.Value()` return `int64`, NOT `int32`/`int16`. The `database/sql/driver` package normalises all integers to `int64`. A type assertion `v.(int32)` always fails silently and returns `nil`.

```go
// BAD — v.(int32) always fails; returns nil silently
if v, ok := n.Value(); ok {
    use(v.(int32))
}

// GOOD — assert int64, then cast to the narrower type
if v, err := n.Value(); err == nil && v != nil {
    use(int32(v.(int64)))
}
```

Applies to `NullInt16` and `NullInt32`. `NullInt64` is fine — its `Value()` already returns `int64`.

## Transactions

- **`defer tx.Rollback()` bare — do NOT "fix" the unchecked error.** Plain `defer tx.Rollback()` right after `BeginTx` is the house pattern (60+ call sites). On the happy path `tx.Commit()` runs first so the rollback returns the harmless `sql.ErrTxDone`. Do not rewrite as `defer func() { _ = tx.Rollback() }()`.
- Pass `*sql.Tx` to `RunWith` inside transactions.

## Connections & Schemas

- **One shared `*sql.DB` pool per service** — do not open a second client for a different schema.
- **Schema-qualify cross-schema reads** — `From(db.CodaSchema + "." + db.OrganizationTable)`.
