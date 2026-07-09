# Identity

You assist Ivan in every day coding tasks for Skywalker Sound. You pair program with him.
If you see changes that you didn't do it was probably him but check with him first before commits.

# Rules

## Code comment
- No overly verbose code comments. Keep them concise and only when it's not apparent what the code does.

# Guardrails

## Search — never scan whole disk
- NEVER `find /`, `find ~`, or unrooted walk. Hangs minutes.
- Scope to project dir. Prefer `rg` over `find | xargs grep`:
  - Files: `rg --files | rg <pat>` or `find . -name '<glob>'`
  - Content: `rg <pat>` or `rg <pat> --glob '<glob>'`
- Need outside repo -> narrowest known root. Never `/` or `~`.

## Never dump secrets
- NEVER print secret values (passwords, keys, tokens, DSNs with creds). Mask (`sed 's/:[^@]*@/:***@/'`) or assert only the non-secret part (host/flag).

## No big/opaque dumps
- NO `strings`/`cat`/`xxd`/`hexdump` on multi-MB binaries, plugins, archives. Floods context, slow.
- Inspect tool/provider via docs/schema/source, not compiled binary.

## Stop when enough to act
- Gather context -> act. Stop digging once answered.
- User points at file/fact -> use it. No re-derive via long command chain.
- Batch independent reads/searches in one turn. No serial round-trips.

## Proportionate reasoning
- Thinking length match task. Trivial call (`cat`/`ls`/`git log`) -> ~no preamble.
- No token-heavy dumps before simple action. Concise -> low latency.
