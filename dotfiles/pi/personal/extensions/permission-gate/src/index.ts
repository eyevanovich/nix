/**
 * Permission Gate Extension
 *
 * Intercepts bash tool calls and applies per-rule gates:
 *   - "always_block" – silently block, no prompt
 *   - "ask"          – prompt the user; block if they say no
 *   - "allow"        – let the command through without interruption
 *
 * Configuration is loaded from ~/.pi/agent/permission-gate.json on each
 * session start.  If the file is absent the file is created with built-in
 * defaults so you always have a ready-to-edit starting point.
 *
 * ── Matching styles ──────────────────────────────────────────────────────────
 *
 *  keywords  Plain string(s), case-insensitive substring match.
 *            No escaping needed — this covers the vast majority of rules.
 *
 *  pattern   A single regex string for cases keywords can't handle.
 *
 *  patterns  An array of regex strings, any one of which triggers the rule.
 *
 * All three fields can coexist in one rule; any match triggers it.
 *
 * ── Example ~/.pi/agent/permission-gate.json ─────────────────────────────────
 *
 * {
 *   "defaultGate": "allow",
 *   "rules": [
 *     { "description": "rm -rf on absolute/home paths", "gate": "ask",
 *       "keywords": ["rm -rf /", "rm -rf ~", "rm -fr /", "rm -fr ~"] },
 *
 *     { "description": "Writing to block devices",      "gate": "always_block",
 *       "keywords": ["> /dev/sd"] },
 *
 *     { "description": "Formatting filesystems",        "gate": "always_block",
 *       "keywords": ["mkfs."] },
 *
 *     { "description": "Raw disk writes",               "gate": "always_block",
 *       "keywords": ["dd if="] },
 *
 *     { "description": "Overly permissive permissions", "gate": "ask",
 *       "keywords": ["chmod 777", "chown 777"] },
 *
 *     { "description": "Pipe output to shell",          "gate": "ask",
 *       "keywords": ["| sh", "| bash"] },
 *
 *     { "description": "Trusted dev tools",             "gate": "allow",
 *       "patterns": ["^git\\b", "^npm\\b", "^node\\b"] }
 *   ]
 * }
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** How the gate responds when a rule matches. */
export type GateMode = "always_block" | "ask" | "allow";

/**
 * A single rule.  Provide at least one of keywords / pattern / patterns.
 * All three can coexist; any match triggers the rule.
 */
export interface RuleConfig {
  /** Human-readable label shown in prompts and block reasons. */
  description: string;
  /** Gate mode for this rule. */
  gate: GateMode;
  /**
   * Plain string(s) for case-insensitive substring matching.
   * The easiest option — no escaping required.
   * Accepts a single string or an array; any keyword match triggers the rule.
   */
  keywords?: string | string[];
  /**
   * A single regex string (passed to new RegExp()).
   * Use when you need something keywords can't express.
   */
  pattern?: string;
  /**
   * Multiple regex strings — any one matching triggers the rule.
   * Useful when several distinct patterns share the same gate/description.
   */
  patterns?: string[];
}

/** Shape of ~/.pi/agent/permission-gate.json */
export interface PermissionGateConfig {
  /**
   * Gate applied when NO rule matches.
   * Defaults to "allow" (unknown commands pass through unchanged).
   * Set to "ask" or "always_block" for a deny-by-default posture.
   */
  defaultGate?: GateMode;
  /**
   * Ordered list of rules. First match wins.
   * (The legacy field name "patterns" is also accepted for backwards compat.)
   */
  rules?: RuleConfig[];
  /** @deprecated Use "rules" instead. Accepted for backwards compatibility. */
  patterns?: RuleConfig[];
}

// Internal resolved form
interface ResolvedRule {
  matches: (command: string) => boolean;
  description: string;
  gate: GateMode;
  /** Human-readable summary for /permission-gate display */
  display: string;
}

// ---------------------------------------------------------------------------
// Built-in defaults
// ---------------------------------------------------------------------------

const CONFIG_PATH = join(homedir(), ".pi", "agent", "permission-gate.json");

export const DEFAULT_RULES: RuleConfig[] = [
  {
    description: "rm -rf on absolute/home paths",
    gate: "ask",
    keywords: ["rm -rf /", "rm -rf ~", "rm -fr /", "rm -fr ~"],
  },
  {
    description: "Writing to block devices",
    gate: "always_block",
    keywords: ["> /dev/sd"],
  },
  {
    description: "Formatting filesystems",
    gate: "always_block",
    keywords: ["mkfs."],
  },
  {
    description: "Raw disk writes",
    gate: "always_block",
    keywords: ["dd if="],
  },
  {
    description: "Overly permissive permissions",
    gate: "ask",
    keywords: ["chmod 777", "chown 777"],
  },
  {
    description: "Pipe output to shell",
    gate: "ask",
    keywords: ["| sh", "| bash"],
  },
  {
    description: "Git force push",
    gate: "ask",
    keywords: ["git push -f", "git push --force"],
  },
];

// ---------------------------------------------------------------------------
// Config loader
// ---------------------------------------------------------------------------

function writeDefaultConfig(): void {
  const defaultConfig: PermissionGateConfig = {
    defaultGate: "allow",
    rules: DEFAULT_RULES,
  };
  mkdirSync(join(homedir(), ".pi", "agent"), { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2) + "\n", "utf-8");
}

function loadConfig(): PermissionGateConfig {
  if (!existsSync(CONFIG_PATH)) {
    writeDefaultConfig();
    return { defaultGate: "allow", rules: DEFAULT_RULES };
  }

  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const config = JSON.parse(raw) as PermissionGateConfig;

    // Accept legacy "patterns" top-level key
    const rules = config.rules ?? config.patterns;
    if (!Array.isArray(rules) || rules.length === 0) {
      console.warn("[permission-gate] Config has no rules — falling back to defaults.");
      return { defaultGate: config.defaultGate ?? "allow", rules: DEFAULT_RULES };
    }

    return { defaultGate: config.defaultGate ?? "allow", rules };
  } catch (err) {
    console.error(`[permission-gate] Failed to parse ${CONFIG_PATH}:`, err);
    return { defaultGate: "allow", rules: DEFAULT_RULES };
  }
}

// ---------------------------------------------------------------------------
// Rule compilation
// ---------------------------------------------------------------------------

function compileRule(r: RuleConfig): ResolvedRule | null {
  const matchers: Array<(cmd: string) => boolean> = [];
  const displayParts: string[] = [];

  // keywords — case-insensitive substring match, no escaping required
  const kws =
    r.keywords != null
      ? Array.isArray(r.keywords)
        ? r.keywords
        : [r.keywords]
      : [];
  if (kws.length > 0) {
    const lowers = kws.map((k) => k.toLowerCase());
    matchers.push((cmd) => lowers.some((k) => cmd.toLowerCase().includes(k)));
    displayParts.push(`keywords: [${kws.map((k) => JSON.stringify(k)).join(", ")}]`);
  }

  // pattern — single regex string
  if (r.pattern != null) {
    try {
      const re = new RegExp(r.pattern);
      matchers.push((cmd) => re.test(cmd));
      displayParts.push(`pattern: /${r.pattern}/`);
    } catch (e) {
      console.warn(`[permission-gate] Invalid regex pattern "${r.pattern}": ${e}`);
    }
  }

  // patterns — array of regex strings, any one triggers
  if (r.patterns != null && r.patterns.length > 0) {
    const valid: RegExp[] = [];
    for (const p of r.patterns) {
      try {
        valid.push(new RegExp(p));
      } catch (e) {
        console.warn(`[permission-gate] Invalid regex "${p}": ${e}`);
      }
    }
    if (valid.length > 0) {
      matchers.push((cmd) => valid.some((re) => re.test(cmd)));
      displayParts.push(
        `patterns: [${r.patterns.map((p) => `/${p}/`).join(", ")}]`
      );
    }
  }

  if (matchers.length === 0) {
    console.warn(
      `[permission-gate] Rule "${r.description}" has no valid matchers (keywords/pattern/patterns) — skipping`
    );
    return null;
  }

  return {
    matches: (cmd) => matchers.some((m) => m(cmd)),
    description: r.description,
    gate: r.gate,
    display: displayParts.join(" | "),
  };
}

function compileRules(config: PermissionGateConfig): ResolvedRule[] {
  return (config.rules ?? []).flatMap((r) => {
    const resolved = compileRule(r);
    return resolved ? [resolved] : [];
  });
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  // Load config immediately so the gate is ready before session_start fires
  // (e.g. in print / RPC mode).
  let config = loadConfig();
  let rules: ResolvedRule[] = compileRules(config);

  // Reload on every session_start so edits to the JSON file take effect on
  // the next session open or /reload.
  pi.on("session_start", async (_event, ctx) => {
    config = loadConfig();
    rules = compileRules(config);
    ctx.ui.notify(`[permission-gate] Loaded config from ${CONFIG_PATH}`, "info");
  });

  // /permission-gate — inspect active rules
  pi.registerCommand("permission-gate", {
    description: "Show active permission-gate rules",
    handler: async (_args, ctx) => {
      const lines = [
        `Config      : ${CONFIG_PATH}`,
        `Default gate: ${config.defaultGate ?? "allow"}`,
        "",
        "Rules:",
        ...rules.map(
          (r, i) =>
            `  ${String(i + 1).padStart(2)}. [${r.gate.padEnd(12)}]  ${r.description}\n` +
            `        ${r.display}`
        ),
      ];
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  // Core interception
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return;

    const command = event.input.command as string;
    const defaultGate: GateMode = config.defaultGate ?? "allow";

    const match = rules.find((r) => r.matches(command));
    const gate: GateMode = match?.gate ?? defaultGate;
    const description = match?.description ?? "command matched default gate";

    switch (gate) {
      case "allow":
        return;

      case "always_block":
        return { block: true, reason: `[permission-gate] Blocked: ${description}` };

      case "ask": {
        if (!ctx.hasUI) {
          return {
            block: true,
            reason: `[permission-gate] Blocked (no UI to prompt): ${description}`,
          };
        }

        const choice = await ctx.ui.select(
          `⚠️  Potentially dangerous command\n\n` +
            `  Reason : ${description}\n` +
            `  Command: ${command}\n\n` +
            `Allow?`,
          ["Yes", "No"]
        );

        if (choice !== "Yes") {
          return { block: true, reason: "[permission-gate] Blocked by user" };
        }

        return;
      }
    }
  });
}
