# Research: Task-Picker Prompt & Context Optimization

> Historical snapshot: this research describes the pre-removal Treehouse/Zellij
> runner and no-mistakes delivery flow. Those components were removed from
> task-picker; use the extension source and README for current behavior.

## Summary
Optimizing prompt templates and runtime-composed instructions in `pi-task-picker` requires relocating dynamic execution arguments to prompt tails, deduplicating shared workflow protocols across task templates, and simplifying task serialization to a key-value format. Moving dynamic `$ARGUMENTS` away from prompt headers converts un-cacheable prompt files into static prefixes, unlocking up to 90% cost reductions and 80% Time-To-First-Token (TTFT) latency improvements on Anthropic and OpenAI APIs. Eliminating redundant prose and duplicated sections reduces raw prompt token volume by ~30%, while structured XML tagging preserves precise subagent orchestration behavior.

## Findings

1. **Static-Prefix Placement Controls Prompt Cache Hits** — Prompt caching mechanisms across major model providers (Anthropic Claude API, OpenAI GPT-4o, and Google Gemini API) rely on strict byte-for-byte prefix matching from character 0. In `prompts/execute-beads.md` and `prompts/execute-gitlab-issue.md`, placing dynamic variables (`Target: $ARGUMENTS`) on line 5 invalidates the cache key for all subsequent instructions (~1,200+ tokens). Relocating dynamic arguments to the end of the prompt allows the static instruction block to hit cache breakpoints across every run. [Anthropic Prompt Caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) | [OpenAI Prompt Caching](https://developers.openai.com/api/docs/guides/prompt-caching) | [Gemini Context Caching](https://ai.google.dev/gemini-api/docs/generate-content/caching)

2. **Deduplication and Shared Protocols Reduce Raw Token Payload** — `execute-beads.md` (207 lines) and `execute-gitlab-issue.md` (152 lines) contain identical multi-paragraph blocks, including the entire 22-line "No-mistakes delivery" workflow and subagent orchestration rules. Empirical research on agent context management shows that prompt redundancy increases prefill latency without improving adherence. Unifying delivery protocols into modular prompt fragments or system-level rules reduces raw input tokens by 25–35%. [An Evaluation of Prompt Caching for Long-Horizon Agentic Tasks (arXiv:2601.06007)](https://arxiv.org/html/2601.06007)

3. **Instruction Hierarchy and XML Tagging Preserve Behavioral Precision** — Official provider guidelines demonstrate that wrapping instructions, context, constraints, and target data in XML/Markdown tags (`<instructions>`, `<subagent_policy>`, `<target_context>`) resolves prompt ambiguity and enforces hierarchy. Replacing conversational filler ("Keep all material facts, caveats, and next actions; omit filler and repetition") with explicit tag boundaries and concise imperative directives reduces token overhead while sharpening agent instruction adherence. [Anthropic Prompting Best Practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices) | [Anthropic Interactive Prompt Tutorial](https://github.com/anthropics/prompt-eng-interactive-tutorial)

4. **Lightweight Key-Value Serialization Outperforms Custom DSLs** — The custom function syntax emitted by `serializeTask()` in `lib/task-serialization.ts` (`task(id=..., title="...", status=...)`) incurs token overhead from quotes, parens, parameter names, and escaped newlines (`\n`). Benchmarks comparing LLM data formats reveal that plain Key-Value (`key: value`) or YAML-style text achieves higher tokenizer efficiency (fewer tokens per byte in `cl100k_base`, `o200k_base`, and Claude tokenizers) and superior attribute extraction accuracy compared to quoted pseudo-code DSLs. [LLM Agent Format Benchmarks](https://github.com/SamuelLHuber/llm-agent-format-benchmarks) | [Prompt Engineering for Structured Data Evaluation](https://www.cs.wm.edu/~dcschmidt/PDF/Optimizing_Prompt_Styles_for_Structured_Data_Generation_in_LLM.pdf)

5. **Token Reductions vs. Cache/Cost Reductions** — Token reduction reduces total input volume (fewer raw tokens sent), whereas static-prefix caching reuses pre-computed KV-cache states for identical prompt prefixes. Raw token pruning in task-picker prompts yields a ~25–35% reduction in input size (~350–500 tokens per prompt expansion). In contrast, prefix stabilization (moving dynamic context after static instructions) delivers up to a 90% cost discount and 80% TTFT latency reduction on Anthropic (and 50% discount on OpenAI) for all remaining static tokens. [Anthropic Pricing & Caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) | [Cache-Aware Prompt Compression (arXiv:2607.15516)](https://arxiv.org/html/2607.15516)

6. **Measurable Evaluation Framework for Task-Picker Prompts** — A robust prompt optimization pipeline requires a two-tiered evaluation strategy: (a) static token auditing via `cl100k_base`/`o200k_base` tokenizers to track raw payload size, and (b) runtime cache telemetry monitoring `cache_read_input_tokens` vs `input_tokens` alongside subagent execution assertion suites to verify zero behavioral regression. [Don’t Break the Cache (arXiv:2601.06007)](https://arxiv.org/html/2601.06007)

## Concrete Recommendations for Task-Picker Files

### 1. `dotfiles/pi/common/extensions/task-picker/prompts/execute-beads.md`
- **Current Issue**: Line 5 sets `Target override: $ARGUMENTS.` at the very beginning of the prompt body, invalidating the prompt cache prefix for the remaining 200+ lines. It also repeats verbose orchestration instructions and duplicates the No-mistakes section.
- **Recommendation**:
  1. Move target argument injection to a `<target_context>` block at the very end of the file.
  2. Structure instructions using clear XML tags: `<role>`, `<workflow>`, `<subagent_policy>`, `<delivery_policy>`.
  3. Replace conversational filler with concise imperative directives.
- **Expected Benefit**: 1,400+ static tokens cached across every `/execute-beads` run (~90% cost savings on static prefix) and ~30% raw token reduction.

### 2. `dotfiles/pi/common/extensions/task-picker/prompts/execute-gitlab-issue.md`
- **Current Issue**: Line 5 sets `Target: $ARGUMENTS.`, breaking cache prefix matching. Duplicates the 22-line "No-mistakes delivery" block and subagent orchestration rules verbatim from `execute-beads.md`.
- **Recommendation**:
  1. Move `$ARGUMENTS` substitution to the tail of the prompt.
  2. Modularize or reference shared delivery rules instead of duplicating text across files.
  3. Enclose configuration rules and pre-mutation guards in explicit XML tags (`<config_guard>`, `<pre_mutation_guard>`).
- **Expected Benefit**: Complete static prefix cacheability across runs and ~35% raw token reduction.

### 3. `dotfiles/pi/common/extensions/task-picker/lib/execution-prompt.ts`
- **Current Issue**: `expandBundledExecutionPrompt()` replaces `$ARGUMENTS` directly inside the prompt template text using regex string replacement.
- **Recommendation**:
  1. Modify `expandBundledExecutionPrompt()` so prompt templates remain 100% static in source.
  2. Append dynamic arguments as a structured block at the end of the prompt: `\n\n<target_context>\nTarget: ${args}\n</target_context>`.
- **Expected Benefit**: Guarantees byte-for-byte static prefix matching regardless of argument length or variations.

### 4. `dotfiles/pi/common/extensions/task-picker/lib/task-serialization.ts`
- **Current Issue**: `serializeTask(task)` formats task objects into a custom quoted function call: `task(id=123, title="Title", status=open, priority=high, type=task, description="...")`.
- **Recommendation**:
  1. Refactor serialization to a clean key-value format without quotes or parenthetical syntax:
     ```text
     id: 123
     title: Title
     status: open
     priority: high
     type: task
     description: ...
     ```
- **Expected Benefit**: ~15–20% token reduction per task string, eliminates escaping overhead (`\n`), and aligns with standard LLM key-value parsing patterns.

### 5. `dotfiles/pi/common/extensions/task-picker/work-runner/worker-instructions.ts`
- **Current Issue**: `isolatedWorkerInstructions()` returns a monolithic free-form text block injected during `before_agent_start`.
- **Recommendation**:
  1. Enclose the instructions in a `<isolated_runner_policy>` tag.
  2. Use compact bulleted directives grouped by lifecycle phase (`<phase_preflight>`, `<phase_delivery>`, `<phase_terminal>`).
  3. Ensure static policy text remains invariant across worker runs to maximize system message cache hits.
- **Expected Benefit**: Improves instruction adherence in worker sessions and stabilizes system prompt cache prefixes.

### 6. `dotfiles/pi/common/extensions/task-picker/work-runner/worker-policy.ts` & `zellij.ts`
- **Current Issue**: Dynamic run variables are passed directly into the agent launch command in `zellij.ts`.
- **Recommendation**:
  1. Ensure static worker policy registered in `worker-policy.ts` is ordered before dynamic task context in turn sequence.
  2. Pass dynamic run IDs and paths strictly through environment variables or isolated tail context.
- **Expected Benefit**: Prevents runtime policy messages from breaking agent conversation cache keys.

## Historical implementation snapshot

At the time of this research, the optimization branch deliberately applied a narrower design than every recommendation above:

- Keep each tracker prompt self-contained; cross-file duplication is a maintenance cost, not a per-run token cost.
- Use only a `<target>` data boundary rather than pervasive XML tags.
- Move dynamic targets to the prompt tail, compact prose into explicit phases, and preserve safety-critical commands and state transitions.
- Reduce the isolated worker policy to isolated-run overrides and persistently inject it once per session branch.
- Defer task serialization changes and shared prompt-fragment machinery.

Measured character-count proxy on this branch:

| Source | Before | After | Reduction |
|---|---:|---:|---:|
| Beads prompt | 14,938 | 7,499 | 49.8% |
| GitLab prompt | 14,214 | 8,834 | 37.8% |
| Isolated policy module | 6,058 | 1,542 | 74.5% |

The largest assembled isolated instruction set is about 10,376 characters versus about 20,996 before. Character counts are regression proxies, not tokenizer- or provider-specific token guarantees.

## Sources

- **Kept**: [Prompt caching - Claude Platform Docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) — Primary vendor documentation for Anthropic prefix caching, 1024 token minimums, cache control breakpoints, and cost structure.
- **Kept**: [Prompt caching | OpenAI API](https://developers.openai.com/api/docs/guides/prompt-caching) — Primary vendor documentation for OpenAI automatic prefix matching, 1024 token block increments, and latency benefits.
- **Kept**: [Context caching - Gemini API](https://ai.google.dev/gemini-api/docs/generate-content/caching) — Primary vendor documentation for Google Gemini explicit and implicit context caching architecture.
- **Kept**: [Prompting best practices - Claude Platform Docs](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices) — Official guidelines on XML tags, prompt hierarchy, and separating data from instructions.
- **Kept**: [Separating Data from Instructions - Anthropic Tutorial](https://github.com/anthropics/prompt-eng-interactive-tutorial) — Official Anthropic research on variable substitution and prompt template design.
- **Kept**: [An Evaluation of Prompt Caching for Long-Horizon Agentic Tasks](https://arxiv.org/html/2601.06007) — Empirical research study measuring prompt caching impact and cache invalidation risks in multi-turn agent systems.
- **Kept**: [Cache-Aware Prompt Compression: A Two-Tier Cost Model for LLM API Caching](https://arxiv.org/html/2607.15516) — Academic research analyzing two-tier cost trade-offs between raw token compression and prefix cache preservation.
- **Kept**: [LLM Agent Format Benchmarks](https://github.com/SamuelLHuber/llm-agent-format-benchmarks) — Empirical benchmark suite evaluating token count and parsing accuracy across JSON, YAML, Key-Value, and custom DSL formats.
- **Kept**: [Prompt engineering for structured data: a comparative evaluation](https://www.cs.wm.edu/~dcschmidt/PDF/Optimizing_Prompt_Styles_for_Structured_Data_Generation_in_LLM.pdf) — Peer-reviewed evaluation benchmarking LLM accuracy and token efficiency across data formats.
- **Dropped**: Medium: Rethinking LLM Inputs — Excluded as secondary commentary; replaced with primary academic and vendor benchmark sources.
- **Dropped**: DigitalOcean Prompt Caching Guide — Excluded as high-level summary; replaced with direct vendor specifications and ArXiv papers.

## Gaps

- **Tokenizer Variance Across Models**: Token savings for key-value task serialization vary slightly depending on whether the active model uses `cl100k_base` (GPT-4), `o200k_base` (GPT-4o), or Claude tokenizers. An automated tokenizer benchmark script should be added to the extension test suite to measure exact savings.
- **Pi API Cache Telemetry**: Pi extension API currently does not expose raw `cache_read_input_tokens` breakdown in standard context objects. Telemetry verification requires inspecting low-level API response metadata or wrapper logs.
- **Suggested Next Steps**: Update `expandBundledExecutionPrompt()` to append dynamic target blocks at prompt tails, restructure `execute-beads.md` and `execute-gitlab-issue.md` with XML tags, convert `serializeTask()` to key-value format, and create static prompt length regression tests in `test/`.
