# Permission Gate Extension

Intercepts bash tool calls and applies per-rule **gates** before execution.

## Gate Modes

| Gate | Behaviour |
|------|-----------|
| `always_block` | Silently block — no prompt, no way through |
| `ask` | Confirmation prompt; block if the user declines |
| `allow` | Explicitly allow — no interruption |

## Configuration

Create (or edit) `~/.pi/agent/permission-gate.json`.  
The file is created automatically with default rules on first use, so it's always ready to edit.  
Changes take effect when you open a new session or run `/reload`.

### Rule matching styles

Each rule needs at least one of `keywords`, `pattern`, or `patterns`.  
All three can coexist in a single rule; **any** match triggers it.

| Field | Type | Description |
|-------|------|-------------|
| `keywords` | `string \| string[]` | Plain text, **case-insensitive substring match**. No escaping needed. The easiest option — covers most rules. |
| `pattern` | `string` | A single regex string (`new RegExp(pattern)`). Use when you need something `keywords` can't express. |
| `patterns` | `string[]` | Multiple regex strings; any one matching triggers the rule. |

### Example config

```json
{
  "defaultGate": "allow",
  "rules": [
    {
      "description": "rm -rf on absolute/home paths",
      "gate": "ask",
      "keywords": ["rm -rf /", "rm -rf ~", "rm -fr /", "rm -fr ~"]
    },
    {
      "description": "Writing to block devices",
      "gate": "always_block",
      "keywords": ["> /dev/sd"]
    },
    {
      "description": "Formatting filesystems",
      "gate": "always_block",
      "keywords": ["mkfs."]
    },
    {
      "description": "Raw disk writes",
      "gate": "always_block",
      "keywords": ["dd if="]
    },
    {
      "description": "Overly permissive permissions",
      "gate": "ask",
      "keywords": ["chmod 777", "chown 777"]
    },
    {
      "description": "Pipe output to shell",
      "gate": "ask",
      "keywords": ["| sh", "| bash"]
    },
    {
      "description": "Git force push",
      "gate": "ask",
      "keywords": ["git push -f", "git push --force"]
    }
  ]
}
```

### Config fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `defaultGate` | `GateMode` | `"allow"` | Gate applied when **no rule** matches |
| `rules` | `RuleConfig[]` | (built-in defaults) | Ordered list of rules; first match wins |

### Deny-by-default posture

Set `"defaultGate": "ask"` and add explicit `"allow"` rules for commands you trust:

```json
{
  "defaultGate": "ask",
  "rules": [
    { "description": "Trusted dev tools", "gate": "allow",
      "keywords": ["git ", "npm ", "node "] },
    { "description": "rm -rf anything",   "gate": "always_block",
      "keywords": ["rm -rf"] }
  ]
}
```

## Built-in Default Rules

Used automatically when `~/.pi/agent/permission-gate.json` does not exist (the file is created on first run).

| Description | Gate | Match |
|-------------|------|-------|
| rm -rf on absolute/home paths | `ask` | `rm -rf /` `rm -rf ~` `rm -fr /` `rm -fr ~` |
| Writing to block devices | `always_block` | `> /dev/sd` |
| Formatting filesystems | `always_block` | `mkfs.` |
| Raw disk writes | `always_block` | `dd if=` |
| Overly permissive permissions | `ask` | `chmod 777` `chown 777` |
| Pipe output to shell | `ask` | `\| sh` `\| bash` |
| Git force push | `ask` | `git push -f` `git push --force` |

## Commands

| Command | Description |
|---------|-------------|
| `/permission-gate` | Print all active rules and their matchers |

## Behaviour in non-interactive mode

In print (`-p`) or JSON mode the UI is unavailable.  
Any `"ask"` rule is treated as `"always_block"` — the agent never hangs on an unanswerable prompt.

## Backwards compatibility

The legacy top-level field `"patterns"` (used in the original regex-only format)
is still accepted; just rename it to `"rules"` when you're ready.
Individual rules still accept `"pattern"` and `"patterns"` regex fields alongside `"keywords"`.

## Installation

Drop `src/index.ts` in `~/.pi/agent/extensions/` for auto-loading, or install
via the pi package system:

```bash
pi install git:github.com/user/repo#extensions/permission-gate
```

## License

MIT
