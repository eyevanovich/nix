/**
 * Uber Go Style Extension
 *
 * Helps Pi write Go code to the team's standards (Uber Go Style Guide + house
 * additions) with near-zero idle context cost.
 *
 * Behavior:
 *   1. session_start — detect a Go project (go.mod or *.go). If not Go, the
 *      extension stays completely silent (zero context cost).
 *   2. Lazy injection — the FIRST time the agent reads/writes/edits a `.go`
 *      file in a Go project, the standards cheat-sheet (+ house rules, if any)
 *      are injected ONCE. No per-turn system-prompt bloat; nothing is injected
 *      in non-Go work or idle sessions.
 *   3. Post-edit lint — after the agent writes/edits a `.go` file, available
 *      tools (gofmt, optionally go vet / golangci-lint) run on the file and
 *      ONLY violations are appended to the tool result. Clean files add
 *      nothing; missing tools are skipped silently.
 *
 * Growable rules: all rules live in editable markdown under standards/.
 * Add house rules by editing standards/house-rules.md — no code changes.
 *
 * Config: ~/.pi/agent/uber-go-style.json (created with defaults on first run)
 *   {
 *     "enabled": true,
 *     "injectStandards": true,
 *     "lint": {
 *       "gofmt": true,          // fast, always available with Go
 *       "goVet": false,         // slower, runs on the file's package
 *       "golangciLint": false,  // auto-skips if not installed
 *       "timeoutMs": 15000
 *     }
 *   }
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url));
const STANDARDS_DIR = join(HERE, "..", "standards");
const CHEAT_SHEET = join(STANDARDS_DIR, "cheat-sheet.md");
const HOUSE_RULES = join(STANDARDS_DIR, "house-rules.md");
const FULL_GUIDE = join(STANDARDS_DIR, "uber-go-style-full.md");

const CONFIG_PATH = join(homedir(), ".pi", "agent", "uber-go-style.json");
const RULES_DIR = join(STANDARDS_DIR, "rules");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

interface LintConfig {
  gofmt: boolean;
  goVet: boolean;
  golangciLint: boolean;
  timeoutMs: number;
}

interface Config {
  enabled: boolean;
  injectStandards: boolean;
  /**
   * How standards are injected once armed (first .go touch this session):
   *   "hybrid" — bridge message covers the current prompt, then resident in the
   *              system prompt every prompt after (default; guaranteed coverage)
   *   "system" — resident in the system prompt from the NEXT prompt on; the
   *              first-touch prompt is not covered (token-frugal, one-prompt late)
   *   "message" — legacy one-time message only; decays in long sessions
   */
  injectMode: "hybrid" | "system" | "message";
  /** Pre-arm at session start when a Go project is detected (standards resident from turn 1). */
  armOnGoProject: boolean;
  lint: LintConfig;
}

const DEFAULT_CONFIG: Config = {
  enabled: true,
  injectStandards: true,
  injectMode: "hybrid",
  armOnGoProject: false,
  lint: {
    gofmt: true,
    goVet: false,
    golangciLint: false,
    timeoutMs: 15000,
  },
};

function loadConfig(): Config {
  if (!existsSync(CONFIG_PATH)) {
    try {
      mkdirSync(join(homedir(), ".pi", "agent"), { recursive: true });
      writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n", "utf-8");
    } catch {
      /* best-effort */
    }
    return DEFAULT_CONFIG;
  }
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as Partial<Config>;
    const mode = raw.injectMode;
    return {
      enabled: raw.enabled ?? DEFAULT_CONFIG.enabled,
      injectStandards: raw.injectStandards ?? DEFAULT_CONFIG.injectStandards,
      injectMode:
        mode === "hybrid" || mode === "system" || mode === "message"
          ? mode
          : DEFAULT_CONFIG.injectMode,
      armOnGoProject: raw.armOnGoProject ?? DEFAULT_CONFIG.armOnGoProject,
      lint: { ...DEFAULT_CONFIG.lint, ...(raw.lint ?? {}) },
    };
  } catch (err) {
    console.error(`[uber-go-style] Failed to parse ${CONFIG_PATH}:`, err);
    return DEFAULT_CONFIG;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isGoFile(path: unknown): path is string {
  return typeof path === "string" && path.endsWith(".go");
}

/** Detect a Go project: go.mod in cwd, or any tracked .go file. */
function detectGoProject(cwd: string): boolean {
  if (existsSync(join(cwd, "go.mod"))) return true;
  const res = spawnSync(
    "bash",
    ["-c", `ls *.go 2>/dev/null | head -1; find . -maxdepth 3 -name '*.go' 2>/dev/null | head -1`],
    { cwd, encoding: "utf-8", timeout: 3000 },
  );
  return Boolean(res.stdout && res.stdout.trim().length > 0);
}

function hasCommand(cmd: string): boolean {
  const res = spawnSync("bash", ["-c", `command -v ${cmd}`], { encoding: "utf-8", timeout: 3000 });
  return res.status === 0 && Boolean(res.stdout && res.stdout.trim());
}

function readFileSafe(path: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Routing table — which rule files to inject and when
// ---------------------------------------------------------------------------

type RuleTier = "core" | "contextual";

interface RuleRoute {
  file: string;       // relative to RULES_DIR
  tier: RuleTier;
  /** If provided, loaded only when the touched file path matches one of these patterns. */
  pathPatterns?: RegExp[];
  /** If provided, loaded only when the touched file content matches one of these patterns. */
  contentPatterns?: RegExp[];
}

const RULE_ROUTES: RuleRoute[] = [
  // Core — always injected on first .go touch (kept short; these are cache-stable)
  { file: "errors.md",      tier: "core" },
  { file: "formatting.md",  tier: "core" },
  { file: "types.md",       tier: "core" },
  { file: "functions.md",   tier: "core" },
  { file: "layering.md",    tier: "core" },

  // Contextual — injected once as a steer message when the touched file matches
  {
    file: "database.md",
    tier: "contextual",
    pathPatterns: [/repo/i, /store/i, /repository/i, /migration/i],
    contentPatterns: [/squirrel/i, /sql\./, /RunWith/, /BeginTx/, /NullInt/],
  },
  {
    file: "concurrency.md",
    tier: "contextual",
    contentPatterns: [/\bgo \w/, /sync\./, /chan /, /errgroup/, /WaitGroup/],
  },
  {
    file: "testing.md",
    tier: "contextual",
    pathPatterns: [/_test\.go$/],
  },
  {
    file: "performance.md",
    tier: "contextual",
    pathPatterns: [/perf/i, /bench/i, /hot/i],
    contentPatterns: [/Benchmark/, /b\.N/],
  },
  {
    file: "aws.md",
    tier: "contextual",
    pathPatterns: [/aws/i, /s3/i],
    contentPatterns: [/s3\.NewFromConfig/, /aws\.Config/, /s3Region/],
  },
  {
    file: "conductor.md",
    tier: "contextual",
    pathPatterns: [/conductor/i, /workflow/i],
    contentPatterns: [/workflow\.FORK/, /workflow\.JOIN/, /TaskType/],
  },
  {
    file: "tooling.md",
    tier: "contextual",
    pathPatterns: [/Makefile/, /\.github/, /\/ci\//i],
  },
  // checklist.md is loaded only via explicit commands (see /go-standards and scan handler)
];

/** Topics already sent as contextual steer messages this session (avoid re-sending). */
const sentContextual = new Set<string>();

/** Read a rule file; returns empty string if missing. */
function readRule(filename: string): string {
  return readFileSafe(join(RULES_DIR, filename)).trim();
}

/** Build the core standards block injected into the system prompt. */
function buildCoreStandards(): string {
  const cheat = readFileSafe(CHEAT_SHEET).trim();
  const coreSections = RULE_ROUTES
    .filter((r) => r.tier === "core")
    .map((r) => readRule(r.file))
    .filter(Boolean)
    .join("\n\n---\n\n");

  return [
    "## Go coding standards (auto-loaded for this Go project)",
    "",
    "You are editing Go in a project that follows the Uber Go Style Guide plus",
    "house additions. Apply these rules to all Go you write or modify. Edited",
    "`.go` files are auto-checked with gofmt/vet; fix any reported violations.",
    "",
    "For deep detail on any rule (full explanation + good/bad examples), call the",
    "`go_standard` tool with the section slug — it returns just that one section",
    "instead of the whole 87KB guide. Call `go_standard` with no arguments to list",
    "every available section slug.",
    "",
    cheat,
    "",
    "---",
    "",
    coreSections,
  ].join("\n");
}

/** Build the standards block used by the scan command (core + all contextual). */
function buildFullStandards(): string {
  const allSections = RULE_ROUTES
    .map((r) => readRule(r.file))
    .filter(Boolean)
    .join("\n\n---\n\n");
  const checklist = readRule("checklist.md");
  return buildCoreStandards() + "\n\n---\n\n" + allSections + (checklist ? "\n\n---\n\n" + checklist : "");
}

/**
 * Return contextual rule files that match the given file path + content.
 * Only returns routes not already sent this session.
 */
function matchContextualRoutes(filePath: string, content: string): RuleRoute[] {
  return RULE_ROUTES.filter((r) => {
    if (r.tier !== "contextual") return false;
    if (sentContextual.has(r.file)) return false;
    const pathMatch = r.pathPatterns?.some((p) => p.test(filePath)) ?? false;
    const contentMatch = r.contentPatterns?.some((p) => p.test(content)) ?? false;
    return pathMatch || contentMatch;
  });
}

/** Legacy alias so the scan command can call a single function. */
function buildStandards(): string {
  return buildFullStandards();
}

// ---------------------------------------------------------------------------
// Full-guide section index (token-cheap deep lookup)
//
// The full upstream Uber guide is bundled at standards/uber-go-style-full.md
// (~87KB) but NEVER injected. We parse its ## / ### / #### headings into a
// section index keyed by GitHub-style anchor slug, so the agent can pull ONE
// section (with its good/bad examples) on demand during an investigation.
// ---------------------------------------------------------------------------

interface GuideSection {
  slug: string;
  title: string;
  level: number;
  body: string;
}

let sectionCache: GuideSection[] | null = null;

/** GitHub-flavored heading slug: lowercase, strip non-alphanumerics (keep spaces/hyphens), spaces->hyphens. */
function githubSlug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s/g, "-");
}

/** Parse the bundled full guide into sections. Each section spans until the next heading of equal-or-higher level. */
function loadSections(): GuideSection[] {
  if (sectionCache) return sectionCache;
  const text = readFileSafe(FULL_GUIDE);
  const lines = text.split("\n");
  const headings: { idx: number; level: number; title: string }[] = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line.trim())) inFence = !inFence;
    if (inFence) continue;
    const m = /^(#{2,4})\s+(.*)$/.exec(line);
    if (m) headings.push({ idx: i, level: m[1].length, title: m[2].trim() });
  }

  const sections: GuideSection[] = [];
  for (let h = 0; h < headings.length; h++) {
    const cur = headings[h];
    // End at the next heading whose level is <= current level.
    let endIdx = lines.length;
    for (let j = h + 1; j < headings.length; j++) {
      if (headings[j].level <= cur.level) {
        endIdx = headings[j].idx;
        break;
      }
    }
    const body = lines.slice(cur.idx, endIdx).join("\n").trim();
    sections.push({
      slug: githubSlug(cur.title.replace(/`/g, "")),
      title: cur.title.replace(/`/g, ""),
      level: cur.level,
      body,
    });
  }
  sectionCache = sections;
  return sections;
}

/** Find a section by exact slug, then substring slug, then title substring (case-insensitive). */
function findSection(query: string): GuideSection | null {
  const sections = loadSections();
  const q = githubSlug(query.replace(/`/g, ""));
  return (
    sections.find((s) => s.slug === q) ??
    sections.find((s) => s.slug.includes(q)) ??
    sections.find((s) => s.title.toLowerCase().includes(query.toLowerCase())) ??
    null
  );
}

/** One-line-per-section table of contents (slug — title) for discovery. */
function sectionToc(): string {
  return loadSections()
    .map((s) => `${"  ".repeat(Math.max(0, s.level - 2))}- ${s.slug}`)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Linting
// ---------------------------------------------------------------------------

function truncate(s: string, max = 1500): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n… (truncated, ${s.length - max} more chars)`;
}

interface LintFinding {
  tool: string;
  output: string;
}

function runLint(absPath: string, cfg: LintConfig): LintFinding[] {
  const findings: LintFinding[] = [];
  const dir = dirname(absPath);

  // gofmt — formatting check (fast, deterministic)
  if (cfg.gofmt && hasCommand("gofmt")) {
    const list = spawnSync("gofmt", ["-l", absPath], {
      encoding: "utf-8",
      timeout: cfg.timeoutMs,
    });
    if (list.stdout && list.stdout.trim()) {
      const diff = spawnSync("gofmt", ["-d", absPath], {
        encoding: "utf-8",
        timeout: cfg.timeoutMs,
      });
      findings.push({
        tool: "gofmt",
        output:
          "File is not gofmt-formatted. Run `gofmt -w` (or `goimports -w`). Diff:\n" +
          truncate((diff.stdout || "").trim()),
      });
    }
  }

  // go vet — runs on the file's package (slower; opt-in)
  if (cfg.goVet && hasCommand("go")) {
    const vet = spawnSync("go", ["vet", "./..."], {
      cwd: dir,
      encoding: "utf-8",
      timeout: cfg.timeoutMs,
    });
    const out = `${vet.stdout || ""}${vet.stderr || ""}`.trim();
    if (vet.status !== 0 && out) {
      findings.push({ tool: "go vet", output: truncate(out) });
    }
  }

  // golangci-lint — opt-in, auto-skips if absent
  if (cfg.golangciLint && hasCommand("golangci-lint")) {
    const lint = spawnSync("golangci-lint", ["run", absPath], {
      cwd: dir,
      encoding: "utf-8",
      timeout: cfg.timeoutMs,
    });
    const out = `${lint.stdout || ""}${lint.stderr || ""}`.trim();
    if (lint.status !== 0 && out) {
      findings.push({ tool: "golangci-lint", output: truncate(out) });
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Branch scan helpers
// ---------------------------------------------------------------------------

function git(args: string[], cwd: string, timeoutMs = 15000): { ok: boolean; out: string } {
  const res = spawnSync("git", args, { cwd, encoding: "utf-8", timeout: timeoutMs });
  return {
    ok: res.status === 0,
    out: `${res.stdout || ""}${res.stderr || ""}`.trim(),
  };
}

/** Resolve a base ref: try the name as-is, then origin/<name>. Returns null if neither exists. */
function resolveBaseRef(base: string, cwd: string): string | null {
  for (const ref of [base, `origin/${base}`]) {
    if (git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], cwd).ok) {
      return ref;
    }
  }
  return null;
}

/** Changed/added .go files between the merge-base of <ref> and HEAD (excludes deletions). */
function changedGoFiles(ref: string, cwd: string): string[] {
  const res = git(["diff", "--name-only", "--diff-filter=d", `${ref}...HEAD`], cwd);
  if (!res.ok) return [];
  return res.out
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.endsWith(".go"));
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function uberGoStyle(pi: ExtensionAPI) {
  let config = loadConfig();
  let isGo = false;
  /** Armed once a .go file is touched this session (or pre-armed in a Go project). Drives system-prompt injection. */
  let armed = false;
  /** Whether the one-time bridge message has been sent (hybrid/message modes). */
  let bridged = false;
  let cwd = process.cwd();

  pi.on("session_start", async (_event, ctx) => {
    config = loadConfig();
    armed = false;
    bridged = false;
    sentContextual.clear();
    cwd = ctx.cwd;
    isGo = config.enabled && detectGoProject(ctx.cwd);
    if (isGo && config.armOnGoProject) {
      armed = true; // standards resident from turn 1 in an established Go project
    }
    if (isGo && ctx.hasUI) {
      ctx.ui.notify("[uber-go-style] Go project detected — standards active.", "info");
    }
  });

  // go_standard — token-cheap deep lookup of a single guide section on demand.
  pi.registerTool({
    name: "go_standard",
    label: "Go Standard Lookup",
    description:
      "Look up the full Uber Go Style Guide section for a rule, with its complete " +
      "explanation and good/bad code examples. Pass a section slug (e.g. " +
      "'error-wrapping', 'receivers-and-interfaces', 'nil-is-a-valid-slice'). " +
      "Call with no 'section' (or section='list') to get every available slug. " +
      "Returns only the requested section so you can investigate deeply without " +
      "loading the entire 87KB guide.",
    promptSnippet:
      "Look up one Uber Go Style Guide section (full text + examples) by slug; investigate Go standards without loading the whole guide",
    promptGuidelines: [
      "Use go_standard to pull the authoritative rule + examples when investigating or justifying a Go standards finding, before editing.",
    ],
    parameters: Type.Object({
      section: Type.Optional(
        Type.String({
          description:
            "Section slug or title to look up (e.g. 'error-wrapping'). Omit or use 'list' to list all sections.",
        }),
      ),
    }),
    async execute(_toolCallId, params) {
      const section = (params.section ?? "").trim();
      if (!section || section.toLowerCase() === "list") {
        const toc = sectionToc();
        return {
          content: [
            {
              type: "text" as const,
              text:
                toc.length > 0
                  ? `Available Uber Go Style Guide sections (call go_standard with a slug):\n\n${toc}`
                  : "Full guide not found at standards/uber-go-style-full.md.",
            },
          ],
          details: { slug: "list", title: "", sections: loadSections().map((s) => s.slug) } as Record<string, unknown>,
        };
      }
      const found = findSection(section);
      if (!found) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                `No section matched "${section}". Call go_standard with section="list" ` +
                "to see all available slugs.",
            },
          ],
          isError: true,
          details: { slug: "", title: "", sections: [] } as Record<string, unknown>,
        };
      }
      return {
        content: [{ type: "text" as const, text: found.body }],
        details: { slug: found.slug, title: found.title, sections: [] } as Record<string, unknown>,
      };
    },
  });

  // Arm on first .go touch — touching a Go file is definitive proof of Go work,
  // independent of project detection (so a brand-new empty Go repo works too).
  // In hybrid/message modes, also send a one-time bridge message so the
  // current prompt is covered (the system prompt for it was already built).
  // On every .go touch, evaluate the routing table and fire contextual topics.
  pi.on("tool_call", async (event) => {
    if (!config.enabled || !config.injectStandards) return;
    if (event.toolName !== "read" && event.toolName !== "write" && event.toolName !== "edit") {
      return;
    }
    const filePath = (event.input as { path?: unknown }).path;
    if (!isGoFile(filePath)) return;

    const wasArmed = armed;
    armed = true; // resident in the system prompt from the next prompt on (system/hybrid)

    // Bridge message (core standards) covers the remaining turns of THIS prompt.
    if (!bridged && config.injectMode !== "system" && !wasArmed) {
      bridged = true;
      pi.sendMessage(
        {
          customType: "uber-go-style",
          content: buildCoreStandards(),
          display: true,
        },
        { deliverAs: "steer" },
      );
    }

    // Contextual topics — read the file content (best-effort) and match routes.
    const absPath = isAbsolute(filePath as string)
      ? (filePath as string)
      : resolve(cwd, filePath as string);
    const fileContent = readFileSafe(absPath);
    const matches = matchContextualRoutes(filePath as string, fileContent);

    for (const route of matches) {
      sentContextual.add(route.file);
      const body = readRule(route.file);
      if (!body) continue;
      pi.sendMessage(
        {
          customType: "uber-go-style-contextual",
          content: `## House rules — ${route.file.replace(".md", "")} (loaded for this file)\n\n${body}`,
          display: false, // silent injection — agent sees it, UI doesn't clutter
        },
        { deliverAs: "steer" },
      );
    }
  });

  // System-prompt residency — once armed, keep CORE standards in the system
  // prompt every prompt (salient, cache-friendly, doesn't decay over long
  // sessions). Contextual topics are sent as one-time steer messages instead,
  // keeping the system prompt lean and stable for KV-cache reuse.
  // "message" mode opts out: it relies solely on the one-time bridge message.
  pi.on("before_agent_start", async (event) => {
    if (!config.enabled || !config.injectStandards) return;
    if (!armed || config.injectMode === "message") return;

    return {
      systemPrompt: event.systemPrompt + "\n\n" + buildCoreStandards(),
    };
  });

  // Post-edit lint — append only violations to the tool result.
  pi.on("tool_result", async (event) => {
    if (!config.enabled || event.isError) return;
    if (event.toolName !== "write" && event.toolName !== "edit") return;

    const rawPath = (event.input as { path?: unknown }).path;
    if (!isGoFile(rawPath)) return;

    const absPath = isAbsolute(rawPath) ? rawPath : resolve(cwd, rawPath);
    if (!existsSync(absPath)) return;

    const findings = runLint(absPath, config.lint);
    if (findings.length === 0) return;

    const report =
      `\n\n⚠️ [uber-go-style] ${rawPath} has standards/lint issues — please fix:\n` +
      findings.map((f) => `\n[${f.tool}]\n${f.output}`).join("\n");

    return {
      content: [...event.content, { type: "text" as const, text: report }],
    };
  });

  // /go-standards — manually show/inject the standards.
  pi.registerCommand("go-standards", {
    description: "Show the active Go coding standards (Uber + house rules)",
    handler: async (_args, ctx) => {
      // Force-send all contextual topics + checklist that haven't been sent yet.
      for (const route of RULE_ROUTES.filter((r) => r.tier === "contextual")) {
        if (sentContextual.has(route.file)) continue;
        sentContextual.add(route.file);
        const body = readRule(route.file);
        if (!body) continue;
        pi.sendMessage(
          {
            customType: "uber-go-style-contextual",
            content: `## House rules — ${route.file.replace(".md", "")}\n\n${body}`,
            display: false,
          },
          { deliverAs: "steer" },
        );
      }
      const checklist = readRule("checklist.md");
      if (checklist) {
        pi.sendMessage(
          { customType: "uber-go-style-contextual", content: checklist, display: false },
          { deliverAs: "steer" },
        );
      }
      ctx.ui.notify(buildFullStandards(), "info");
    },
  });

  // /go-standards-scan [--base <branch>] [--fix]
  // Scan this branch's Go changes vs a base branch (default: main) against the
  // standards, running the configured linters and handing the diff + findings
  // to the agent for a judgment pass. --fix applies fixes; otherwise report-only.
  pi.registerCommand("go-standards-scan", {
    description:
      "Scan this branch's Go changes vs a base branch for standards violations. Flags: --base <branch> (default main), --fix",
    getArgumentCompletions: (prefix: string) => {
      const items = [
        { value: "--base main", label: "--base main — compare against main" },
        { value: "--base v2", label: "--base v2 — compare against v2" },
        { value: "--fix", label: "--fix — apply fixes immediately" },
      ];
      const filtered = items.filter((i) => i.value.startsWith(prefix));
      return filtered.length > 0 ? filtered : null;
    },
    handler: async (args, ctx) => {
      const tokens = (args ?? "").trim().split(/\s+/).filter(Boolean);
      const fix = tokens.includes("--fix");
      let base = "main";
      const baseIdx = tokens.indexOf("--base");
      if (baseIdx !== -1 && tokens[baseIdx + 1]) {
        base = tokens[baseIdx + 1];
      } else {
        // Allow a bare branch name (first non-flag token).
        const bare = tokens.find((t) => !t.startsWith("--"));
        if (bare) base = bare;
      }

      if (!config.enabled) {
        ctx.ui.notify("[uber-go-style] Extension disabled in config.", "warning");
        return;
      }
      if (!git(["rev-parse", "--is-inside-work-tree"], cwd).ok) {
        ctx.ui.notify("[uber-go-style] Not inside a git repository.", "error");
        return;
      }

      const ref = resolveBaseRef(base, cwd);
      if (!ref) {
        ctx.ui.notify(
          `[uber-go-style] Base branch '${base}' not found (tried '${base}' and 'origin/${base}').`,
          "error",
        );
        return;
      }

      const files = changedGoFiles(ref, cwd);
      if (files.length === 0) {
        ctx.ui.notify(`[uber-go-style] No changed .go files vs ${ref}.`, "info");
        return;
      }

      ctx.ui.notify(
        `[uber-go-style] Scanning ${files.length} changed .go file(s) vs ${ref}${fix ? " (--fix)" : " (report-only)"}…`,
        "info",
      );

      // Machine-checkable findings via the shared lint runner.
      const lintBlocks: string[] = [];
      for (const rel of files) {
        const abs = resolve(cwd, rel);
        if (!existsSync(abs)) continue;
        const findings = runLint(abs, config.lint);
        if (findings.length > 0) {
          lintBlocks.push(
            `### ${rel}\n` + findings.map((f) => `[${f.tool}]\n${f.output}`).join("\n\n"),
          );
        }
      }

      // The actual diff for the judgment pass (capped to protect context).
      const diffRes = git(["diff", "--diff-filter=d", `${ref}...HEAD`, "--", ...files], cwd, 20000);
      const diff = truncate(diffRes.out, 40000);

      // Also send checklist as a steer for scan sessions.
      const checklist = readRule("checklist.md");
      if (checklist) {
        pi.sendMessage(
          { customType: "uber-go-style-contextual", content: checklist, display: false },
          { deliverAs: "steer" },
        );
      }

      const toc = sectionToc();
      const lintSection =
        lintBlocks.length > 0
          ? lintBlocks.join("\n\n")
          : "(no machine-checkable lint violations found by the configured tools)";

      const action = fix
        ? "Apply the fixes directly by editing the files. After each edit, the extension re-lints automatically — resolve anything it reports. Then summarize what you changed."
        : "Do NOT edit files. Produce a report grouped by file: each issue, the rule it violates, and the suggested fix. End with a prioritized list of the critical ones.";

      const message = [
        `# Go standards scan — this branch vs \`${ref}\``,
        "",
        `Changed Go files (${files.length}):`,
        ...files.map((f) => `- ${f}`),
        "",
        "## Standards to enforce",
        "",
        buildStandards(),
        "",
        "## Machine-checkable lint findings",
        "",
        lintSection,
        "",
        "## Diff to review (judgment-based rules)",
        "",
        "```diff",
        diff,
        "```",
        "",
        "## Task",
        "",
        "Review the diff above against the standards. Look especially for the",
        "judgment-based rules linters miss: error wrapping with `%w`, sentinel/",
        "custom error naming, receiver consistency, pointers-to-interfaces, nil",
        "vs empty slices, defensive copies at boundaries, `panic` in library code,",
        "naming/stutter, mutable globals, and `init()` usage.",
        "",
        "When a finding needs the authoritative rule text or examples to confirm or",
        "justify it, call the `go_standard` tool with the matching section slug",
        "(below) — do NOT load the whole guide. Available section slugs:",
        "",
        toc,
        "",
        action,
      ].join("\n");

      pi.sendMessage(
        { customType: "uber-go-style-scan", content: message, display: true },
        { triggerTurn: true },
      );
    },
  });
}
