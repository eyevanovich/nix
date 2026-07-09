# Linting & Tooling

CI runs **`go test ./...` only — no `golangci-lint`/`staticcheck`/`errcheck` gate**. The codebase is the source of truth, not an off-the-shelf linter.

- Before "fixing" a lint finding, grep for how the pattern is used elsewhere. If the existing convention is consistent, match it even if a default linter complains.
- **Local pre-merge checks:** `go build ./...`, `go vet ./...`, `gofmt -l <pkgs>` (must be empty), `go test ./...`, `deadcode ./<component>/...`.
- **Known intentional deviations:** Squirrel dot-import (`ST1001`), bare `defer tx.Rollback()` (`errcheck`).
- **Genuinely fix:** unused computed values (`SA4006`), error-var naming (`ST1012` → `errFoo`, no `_` prefix).
