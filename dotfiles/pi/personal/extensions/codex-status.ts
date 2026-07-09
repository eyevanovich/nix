import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { BorderedLoader } from "@earendil-works/pi-coding-agent";
import { type Component, Key, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";

type RateLimitWindow = {
	used_percent: number;
	limit_window_seconds: number;
	reset_after_seconds: number;
	reset_at: number;
};

type RateLimitDetails = {
	allowed: boolean;
	limit_reached: boolean;
	primary_window?: RateLimitWindow | null;
	secondary_window?: RateLimitWindow | null;
};

type UsageResponse = {
	plan_type: string;
	rate_limit?: RateLimitDetails | null;
	additional_rate_limits?: Array<{
		metered_feature: string;
		limit_name: string;
		rate_limit?: RateLimitDetails | null;
	}> | null;
};

type StatusData = {
	model: string;
	directory: string;
	email?: string;
	planType: string;
	usage: UsageResponse;
};

function decodeJwt(token: string): Record<string, unknown> | null {
	try {
		const parts = token.split(".");
		if (parts.length !== 3 || !parts[1]) return null;
		const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
		return JSON.parse(Buffer.from(base64, "base64").toString("utf8")) as Record<string, unknown>;
	} catch {
		return null;
	}
}

function titleCase(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

function windowLabel(seconds: number): string {
	if (seconds === 604800) return "Weekly limit";
	const hours = Math.round(seconds / 3600);
	return `${hours}h limit`;
}

function formatResetTime(resetAt: number): string {
	const date = new Date(resetAt * 1000);
	const now = new Date();
	const hh = date.getHours().toString().padStart(2, "0");
	const mm = date.getMinutes().toString().padStart(2, "0");
	const time = `${hh}:${mm}`;

	const isToday =
		date.getFullYear() === now.getFullYear() &&
		date.getMonth() === now.getMonth() &&
		date.getDate() === now.getDate();

	if (isToday) return `resets ${time}`;

	const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
	return `resets ${time} on ${date.getDate()} ${months[date.getMonth()]}`;
}

function renderBar(usedPercent: number, width = 20): string {
	const remaining = Math.max(0, Math.min(width, Math.round(((100 - usedPercent) / 100) * width)));
	const used = width - remaining;
	return "█".repeat(remaining) + "░".repeat(used);
}

function barColor(usedPercent: number, fg: (c: string, s: string) => string): (s: string) => string {
	const remaining = 100 - usedPercent;
	if (remaining > 50) return (s: string) => fg("success", s);
	if (remaining > 20) return (s: string) => fg("warning", s);
	return (s: string) => fg("error", s);
}

class CodexStatusComponent implements Component {
	private cachedWidth?: number;
	private cachedLines?: string[];

	constructor(
		private data: StatusData,
		private fg: (color: string, text: string) => string,
		private onDone: () => void,
	) {}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}

	handleInput(data: string): void {
		if (matchesKey(data, Key.escape) || matchesKey(data, Key.enter) || matchesKey(data, Key.ctrl("c")) || data === "q") {
			this.onDone();
		}
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;

		const fg = this.fg;
		const d = this.data;
		const lines: string[] = [];
		const pad = "  ";
		const border = fg("dim", "─".repeat(Math.max(1, Math.min(width - 4, 60))));
		const label = (k: string, v: string) => `${pad}${fg("dim", k.padEnd(18))}${v}`;

		lines.push("");
		lines.push(`${pad}${fg("accent", "Codex status")}`);
		lines.push(`${pad}${fg("dim", "Source: https://chatgpt.com/codex/settings/usage")}`);
		lines.push("");
		lines.push(`${pad}${border}`);
		lines.push("");
		lines.push(label("Model:", d.model));
		lines.push(label("Directory:", d.directory));
		lines.push(label("Account:", d.email ? `${d.email} (${titleCase(d.planType)})` : `(${titleCase(d.planType)})`));
		lines.push("");

		const addRateLimits = (details: RateLimitDetails | null | undefined, heading?: string) => {
			if (!details) return;
			if (heading) lines.push(`${pad}${fg("accent", heading)}`);

			for (const w of [details.primary_window, details.secondary_window]) {
				if (!w) continue;
				const remaining = Math.round(100 - w.used_percent);
				const color = barColor(w.used_percent, fg);
				const bar = color(`[${renderBar(w.used_percent)}]`);
				const pct = color(`${remaining}% left`);
				const reset = fg("dim", `(${formatResetTime(w.reset_at)})`);
				lines.push(`${pad}${fg("dim", windowLabel(w.limit_window_seconds).padEnd(18))}${bar} ${pct} ${reset}`);
			}
		};

		addRateLimits(d.usage.rate_limit);

		for (const extra of d.usage.additional_rate_limits ?? []) {
			lines.push("");
			addRateLimits(extra.rate_limit, `${extra.limit_name}:`);
		}

		lines.push("");
		lines.push(`${pad}${fg("dim", "Press q, Enter, Esc, or Ctrl+C to dismiss")}`);
		lines.push("");

		this.cachedWidth = width;
		this.cachedLines = lines.map((line) => truncateToWidth(line, width));
		return this.cachedLines;
	}
}

async function fetchUsage(token: string, accountId: string): Promise<UsageResponse> {
	const res = await fetch("https://chatgpt.com/backend-api/wham/usage", {
		headers: {
			Authorization: `Bearer ${token}`,
			"ChatGPT-Account-Id": accountId,
		},
	});

	if (!res.ok) throw new Error(`Usage API returned ${res.status}`);
	return (await res.json()) as UsageResponse;
}

async function getStatus(ctx: ExtensionCommandContext): Promise<StatusData> {
	const authStorage = ctx.modelRegistry.authStorage;
	const cred = authStorage.get("openai-codex");
	if (!cred || cred.type !== "oauth") throw new Error("Not logged in to OpenAI Codex. Use /login first.");

	const token = await authStorage.getApiKey("openai-codex");
	if (!token) throw new Error("Failed to get OpenAI Codex token");

	const accountId = (cred as Record<string, unknown>).accountId as string | undefined;
	if (!accountId) throw new Error("No accountId found in OpenAI Codex credentials. Try /login again.");

	const usage = await fetchUsage(token, accountId);
	const jwt = decodeJwt(token);
	const email = (jwt?.email as string | undefined) ?? undefined;

	const home = process.env.HOME || process.env.USERPROFILE || "";
	let directory = process.cwd();
	if (home && directory.startsWith(home)) directory = `~${directory.slice(home.length)}`;

	return {
		model: ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "unknown",
		directory,
		email,
		planType: usage.plan_type,
		usage,
	};
}

export default function codexStatusExtension(pi: ExtensionAPI) {
	pi.registerCommand("codex-status", {
		description: "Show OpenAI Codex account and rate-limit status",
		async handler(_args, ctx) {
			if (!ctx.hasUI) {
				ctx.ui.notify("/codex-status requires interactive mode", "error");
				return;
			}

			const result = await ctx.ui.custom<StatusData | { error: string } | null>((tui, theme, _keybindings, done) => {
				const loader = new BorderedLoader(tui, theme, "Fetching Codex status...");
				loader.onAbort = () => done(null);
				getStatus(ctx).then(done).catch((error: unknown) => done({ error: error instanceof Error ? error.message : String(error) }));
				return loader;
			});

			if (!result) return;
			if ("error" in result) {
				ctx.ui.notify(result.error, "error");
				return;
			}

			await ctx.ui.custom<void>((_tui, theme, _keybindings, done) => {
				return new CodexStatusComponent(result, theme.fg.bind(theme), () => done());
			});
		},
	});
}
