# Testing

- **Table-driven tests** with subtests (`t.Run`).
- **Naming**: slice `tests`, loop var `tt`, fields `give`/`want`/`wantErr`.
- **Parallel**: `t.Parallel()` in independent subtests.
- **Error cases** in the same table with `wantErr bool`.
- **Per-case `check` closure** — when most cases assert a simple `want` but a few need to inspect captured mock state, add an optional `check func(t *testing.T, ...)` field to the table instead of bloating the struct with one-off fields or splitting into separate test funcs.
- **JSON contract tests** in the controller package — marshal the controller struct and assert against a golden JSON string so accidental tag/field renames are caught early.

```go
func TestSummary_JSONContract(t *testing.T) {
    got, _ := json.Marshal(Summary{E2EID: 1, Name: "x", RunCount: 3})
    assert.JSONEq(t, `{"e2e_id":1,"name":"x","run_count":3}`, string(got))
}
```
