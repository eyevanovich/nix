# RTK vs context-mode for Pi Coding Agent

## Decision

**Recommendation: use both, but make context-mode the context/session layer and RTK the Bash-output layer.** Install context-mode as the Pi package/MCP bridge, then install RTK's Pi extension (`rtk init -g --agent pi`). Keep RTK's extension rewrite-only and context-mode's routing enforcement enabled. Do not expect RTK to optimize Pi `read`/`grep` calls or `ctx_*` calls; do not expect context-mode's sandbox to rewrite ordinary Bash into RTK commands.

This recommendation is based on the official repositories' current source and documentation. Pin and test versions: both projects are actively changing, and Pi hook ordering/extension behavior is an integration risk.

## Comparison

| Aspect | RTK (`rtk-ai/rtk`) | context-mode (`mksglu/context-mode`) |
|---|---|---|
| Primary job | Transparent CLI proxy: rewrites eligible shell commands to `rtk ...`, then filters/compresses output. | MCP tools plus Pi extension: executes/indexes data outside the model transcript, returns selected results, and maintains session memory. |
| Architecture | Single Rust binary; Rust filters/TOML DSL; SQLite savings tracking; fail-open passthrough. | TypeScript server/runtime, SQLite session store, FTS5/BM25 search, JS/Python/Bash execution/sandbox tools, and a Pi TypeScript adapter/MCP bridge. |
| Interception point in Pi | `tool_call`, only when the tool is `bash`; invokes `rtk rewrite` and mutates `event.input.command`. | `tool_call` for routing/blocking, `tool_result` for capture, `session_start`, `before_agent_start`, `context`, compaction/shutdown and provider/turn events. It also registers `ctx_*` through a bridge because Pi lacks native MCP in some versions. |
| Inputs/tools | Shell commands, with 100+ command families (git, grep/rg, file listing/reading, tests, linters, containers, cloud/IaC, etc.). Unknown commands pass through. | `ctx_execute`, `ctx_execute_file`, `ctx_batch_execute`, `ctx_index`, `ctx_search`, `ctx_fetch_and_index`, and meta tools such as stats/doctor/purge; intended for large command output, files, web data and indexed knowledge. Pi's built-in Bash/Read/Write/Edit/Grep/Find/LS results are captured. |
| Setup | `brew install rtk`; `rtk init -g --agent pi` (global) or project-local equivalent. Requires RTK >= 0.23 for the Pi extension. | `npm install -g context-mode`; `pi install npm:context-mode`; add `context-mode` to Pi's `mcp.json`; restart Pi. The extension is in `src/adapters/pi/extension.ts`; the package also supplies `.pi/extensions/context-mode`. |
| Continuity/search | RTK's SQLite is command savings/adoption history (`gain`, `session`, `discover`), not conversation memory or semantic/full-text session retrieval. | Events and decisions are persisted in SQLite; FTS5/BM25 search retrieves indexed content and prior events. `before_agent_start` injects a small routing anchor, active memory (capped around 500 tokens), and an unconsumed resume snapshot via Pi's `context` hook. |
| Security/privacy | No command permission system by design; rewrite-only. Telemetry is opt-in; docs say aggregate/anonymized command metadata, not source, paths, arguments, secrets or repository contents. Raw failed output may be tee'd locally. | Routing blocks inline HTTP clients and unsafe curl/wget in Pi; shared security code includes deny patterns and project-boundary/symlink checks. Raw results are intentionally retained in local SQLite/sandbox for indexing, so local data-at-rest exposure and database lifecycle matter. The project is ELv2, not Apache-2.0. |
| Overhead | Claims <10 ms per command, single-threaded, no async; Pi adds an `rtk rewrite` subprocess with a 2-second timeout and fail-open behavior. | Node process/MCP bridge, SQLite/native `better-sqlite3`, execution/indexing and lifecycle handlers; no comparable Pi-specific latency claim found in the primary sources. |
| Claimed savings | “Up to 90%” of Bash output (README also says 60–90% common commands); estimates tokens as bytes/4, not a tokenizer. | README's example claims 315 KB → 5.4 KB / 98%; this is sandbox/context-result reduction, not a measured whole-bill or model-quality result. |

## Pi-specific overlap and conflicts

1. **Both listen to `tool_call`, but they do different things.** RTK narrows to `bash`, asynchronously runs `rtk rewrite`, and mutates the command only when RTK has a rewrite. context-mode's `tool_call` handler also narrows to Bash, but its shown policy is to block inline `fetch`/`requests`/`http`/`urllib` and unsafe `curl`/`wget`; it does not rewrite commands to RTK. RTK therefore should not undo context-mode blocking. [RTK Pi hook](https://github.com/rtk-ai/rtk/blob/develop/hooks/pi/rtk.ts) · [context-mode Pi extension](https://github.com/mksglu/context-mode/blob/main/src/adapters/pi/extension.ts)
2. **Order is still a test requirement.** Pi extension registration order and whether async `tool_call` handlers are awaited are host behavior. A command could be inspected by context-mode before/after RTK mutation. Since context-mode strips quoted content and splits command chains, and RTK's Rust rewrite pipeline handles compound commands, test chained commands, quoted URLs, `curl -s -o file`, and RTK rewrites in a real Pi session.
3. **The largest outputs may bypass RTK.** If the model follows context-mode routing and calls `ctx_execute*`, there is no ordinary Pi Bash `tool_call` for RTK to rewrite. This is desirable: context-mode owns sandboxed execution and result selection. Conversely, ordinary Pi `bash` commands are the RTK sweet spot; context-mode records the result but does not replace RTK's command-specific compression.
4. **Pi structured tools are not RTK-intercepted.** Pi's `read`, `grep`, `find`, etc. do not pass through RTK's Bash extension. Use context-mode's `ctx_execute_file`/`ctx_search` for large reads/searches, or explicit `rtk read`/`rtk grep` from Bash when appropriate.
5. **Two kinds of persistence are complementary, not duplicates.** RTK tracks savings and raw failure tee files; context-mode tracks task/tool/user events and indexed content. Both use local SQLite, so account for disk retention, backups, and sensitive-data access.
6. **MCP bridge failure behavior differs.** RTK fails open to the original Bash command. context-mode's Pi bridge is best-effort, but its routing can still block unsafe HTTP patterns and provide an MCP-down file-output escape hatch. Verify recovery after bridge failure so the agent is not left unable to fetch data.

## How to interpret the savings claims

The percentages are not directly comparable. RTK measures reduction in **captured Bash bytes** and explicitly says this is only one contributor to input tokens; its absolute token estimate is bytes/4. context-mode measures selected context/result reduction in its examples and reports a much broader sandboxing/indexing workflow. Neither source establishes equal workloads, tokenizer-based counts, provider billing impact, latency-quality tradeoffs, or additive savings when both are enabled. Measure Ivan's actual Pi traces with each enabled alone and together (bytes/tokens entering the model, tool latency, failures, and ability to recover full output).

## Security/privacy assessment

- RTK's documented telemetry is opt-in and can be disabled; nevertheless, inspect `tee` settings because failed-command raw output can be written locally. Its rewrite layer is not a security boundary and intentionally does not approve/deny commands.
- context-mode's Pi routing explicitly prevents common context floods, and source implements project containment checks for indexed/file execution (including lexical traversal and symlink escapes). It still runs a local execution server and stores raw/indexed data; treat its SQLite/session directories as sensitive. The public docs do not justify claiming that arbitrary secrets are automatically removed from all indexed output.

## Gaps / uncertainty

- No independent benchmark or controlled Pi comparison was found in either official repository; claims are project-reported.
- Pi's exact async extension dispatch/ordering should be verified against the installed Pi version, rather than inferred from source comments.
- context-mode's README and platform matrix have evolved rapidly; the README currently describes a full Pi extension/bridge while the matrix labels Pi MCP-only. The Pi adapter source and README installation section are the stronger evidence for current behavior, but pin a commit/version and run `ctx doctor`/a smoke test.

## Primary sources kept

- [RTK README](https://github.com/rtk-ai/rtk/blob/develop/README.md) — supported commands/agents, savings caveat, telemetry and setup.
- [RTK technical architecture](https://github.com/rtk-ai/rtk/blob/develop/docs/contributing/TECHNICAL.md) — rewrite pipeline, filters, tracking, performance constraints and fallback behavior.
- [RTK Pi hook README](https://github.com/rtk-ai/rtk/blob/develop/hooks/pi/README.md) and [source](https://github.com/rtk-ai/rtk/blob/develop/hooks/pi/rtk.ts) — exact Pi interception and fail-open/version behavior.
- [context-mode README](https://github.com/mksglu/context-mode/blob/main/README.md) — architecture, tools, setup, privacy claims and savings example.
- [context-mode Pi adapter](https://github.com/mksglu/context-mode/blob/main/src/adapters/pi/extension.ts) — actual Pi lifecycle hooks, routing, bridge, memory and resume injection.
- [context-mode Pi MCP bridge](https://github.com/mksglu/context-mode/blob/main/src/adapters/pi/mcp-bridge.ts) — why/ how `ctx_*` tools are made available to Pi.
- [context-mode platform matrix](https://github.com/mksglu/context-mode/blob/main/docs/platform-support.md) — platform capability caveat and configuration paths.

## Acceptance report

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Only the requested Markdown artifact was written at the authoritative path."
    },
    {
      "id": "criterion-2",
      "status": "satisfied",
      "evidence": "Brief cites official RTK/context-mode GitHub README, architecture, Pi source, bridge, and platform-matrix evidence and calls out gaps."
    }
  ],
  "changedFiles": ["docs/research/context-mode-vs-rtk.md"],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {"command": "Official-source web research and repository file inspection", "result": "passed", "summary": "Reviewed RTK README/technical docs/Pi hook and context-mode README/Pi adapter/bridge/platform matrix."},
    {"command": "Markdown artifact write", "result": "passed", "summary": "Wrote the requested file."}
  ],
  "validationOutput": ["Artifact exists at /Users/ipiesh/.config/nix/docs/research/context-mode-vs-rtk.md and contains citations plus decision recommendation."],
  "residualRisks": ["Pi extension dispatch ordering and rapidly changing context-mode Pi support require a pinned-version smoke test."],
  "noStagedFiles": true,
  "diffSummary": "Added one research brief; no project/source files modified.",
  "reviewFindings": ["no blockers"],
  "manualNotes": "Savings percentages are not additive or directly comparable; measure actual Pi traces."
}
```
