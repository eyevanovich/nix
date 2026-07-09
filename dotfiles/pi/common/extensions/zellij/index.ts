/**
 * Zellij Pane Management Extension
 *
 * Gives the LLM tools to manage Zellij panes:
 * - zellij_list: list all panes
 * - zellij_run: spawn command in new pane
 * - zellij_run_and_wait: run command in pane, block until exit, return output
 * - zellij_pane_output: read pane contents
 * - zellij_wait_for_output: poll pane until regex matches or timeout
 * - zellij_close: close a pane
 * - zellij_focus: focus a pane
 * - zellij_send_keys: send keys/text to a pane (Ctrl+C, Enter, arbitrary text)
 * - zellij_rename_pane: rename a pane by ID
 *
 * Fixes applied:
 * 1. Zellij detection guard — skip registration outside Zellij
 * 2. zellij_send_keys tool — send keys including Ctrl+C to panes
 * 3. Self-pane protection — refuse to close pi's own pane
 * 4. Parallel shutdown cleanup — Promise.allSettled
 * 5. zellij_rename_pane tool
 * 6. Configurable truncation — pi standard 2000 lines / 50KB
 * 7. close_on_exit Set housekeeping — remove from managedPanes if self-closing
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DEFAULT_MAX_LINES, DEFAULT_MAX_BYTES, truncateTail } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// Normalise pane ID: "terminal_2", "2" -> "terminal_2"
function normalisePaneId(raw: string): string {
	if (/^\d+$/.test(raw.trim())) return `terminal_${raw.trim()}`;
	return raw.trim();
}

export default function (pi: ExtensionAPI) {
	// --- Fix #1: Zellij detection guard ---
	if (process.env.ZELLIJ === undefined) {
		// Not inside a Zellij session — skip all tool registrations
		console.log("[zellij extension] Not in a Zellij session ($ZELLIJ unset). Tools not registered.");
		return;
	}

	// Own pane ID — protect against self-close
	const ownPaneId = process.env.ZELLIJ_PANE_ID
		? normalisePaneId(process.env.ZELLIJ_PANE_ID)
		: undefined;

	// Track panes spawned by this extension for cleanup
	const managedPanes = new Set<string>();

	// --- Fix #4: Parallel shutdown cleanup ---
	pi.on("session_shutdown", async () => {
		await Promise.allSettled(
			[...managedPanes].map((paneId) =>
				pi.exec("zellij", ["action", "close-pane", "--pane-id", paneId], {
					timeout: 2000,
				})
			)
		);
		managedPanes.clear();
	});

	// --- zellij_list ---
	pi.registerTool({
		name: "zellij_list",
		label: "Zellij List Panes",
		description:
			"List all panes in the current Zellij session. Returns pane IDs, types, and titles.",
		promptSnippet: "List all Zellij panes (ID, type, title)",
		parameters: Type.Object({}),

		async execute(_toolCallId, _params, signal) {
			const result = await pi.exec("zellij", ["action", "list-panes"], {
				signal,
				timeout: 5000,
			});

			if (result.code !== 0) {
				throw new Error(
					`zellij list-panes failed: ${result.stderr || result.stdout}`,
				);
			}

			return {
				content: [{ type: "text", text: result.stdout.trim() }],
				details: { raw: result.stdout.trim() },
			};
		},
	});

	// --- zellij_run ---
	pi.registerTool({
		name: "zellij_run",
		label: "Zellij Run",
		description:
			"Run a command in a new Zellij pane. Returns the created pane ID. Use for long-running processes, servers, watchers, or parallel tasks.",
		promptSnippet: "Run command in new Zellij pane (floating or split, named)",
		promptGuidelines: [
			"Use zellij_run for long-running processes (servers, watchers, builds) instead of bash when the process should persist in a visible pane.",
		],
		parameters: Type.Object({
			command: Type.String({ description: "Command to run in the new pane" }),
			name: Type.Optional(
				Type.String({ description: "Name for the new pane" }),
			),
			direction: Type.Optional(
				StringEnum(["right", "down"] as const, {
					description: "Split direction. Omit for floating pane.",
				}),
			),
			floating: Type.Optional(
				Type.Boolean({
					description: "Open as floating pane (default: false — opens in current tab)",
				}),
			),
			cwd: Type.Optional(
				Type.String({ description: "Working directory for the command" }),
			),
			close_on_exit: Type.Optional(
				Type.Boolean({
					// Fix #7: document that close_on_exit panes self-remove from tracking
					description:
						"Close pane when command exits (default: false). Note: self-closing panes are automatically removed from managed pane tracking.",
				}),
			),
			start_suspended: Type.Optional(
				Type.Boolean({
					description: "Start suspended, requiring Enter to run (default: false)",
				}),
			),
		}),

		async execute(_toolCallId, params, signal) {
			const args: string[] = ["action", "new-pane"];

			if (params.direction) {
				args.push("--direction", params.direction);
			} else if (params.floating) {
				args.push("--floating");
			}
			// Default (no direction, no floating): Zellij opens in current tab

			if (params.name) {
				args.push("--name", params.name);
			}

			if (params.cwd) {
				args.push("--cwd", params.cwd);
			}

			if (params.close_on_exit) {
				args.push("--close-on-exit");
			}

			if (params.start_suspended) {
				args.push("--start-suspended");
			}

			// Always use /bin/sh — $SHELL may be fish, which doesn't support (cmd) subshell syntax
			if (params.close_on_exit) {
				// Track completion via a marker file (can't call back into JS from the shell)
				const marker = `/tmp/zellij-closed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
				// Always use /bin/sh — $SHELL may be fish
				args.push("--", "/bin/sh", "-c", `${params.command}; touch ${marker}`);

				const result = await pi.exec("zellij", args, { signal, timeout: 10000 });

				if (result.code !== 0) {
					throw new Error(`zellij new-pane failed: ${result.stderr || result.stdout}`);
				}

				const paneId = result.stdout.trim();
				managedPanes.add(paneId);

				// Background poll to remove from set when pane self-closes
				(async () => {
					for (let i = 0; i < 240; i++) { // max 2 min
						await sleep(500);
						const check = await pi.exec("test", ["-f", marker], { timeout: 1000 });
						if (check.code === 0) {
							managedPanes.delete(paneId);
							await pi.exec("rm", ["-f", marker], { timeout: 1000 });
							break;
						}
					}
				})();

				return {
					content: [{
						type: "text",
						text: `Pane created: ${paneId}\nCommand: ${params.command}${params.name ? `\nName: ${params.name}` : ""}\n(will auto-close on exit)`,
					}],
					details: { paneId, command: params.command, name: params.name },
				};
			}

			args.push("--", "/bin/sh", "-c", params.command);

			const result = await pi.exec("zellij", args, { signal, timeout: 10000 });

			if (result.code !== 0) {
				throw new Error(`zellij new-pane failed: ${result.stderr || result.stdout}`);
			}

			const paneId = result.stdout.trim();
			managedPanes.add(paneId);

			return {
				content: [{
					type: "text",
					text: `Pane created: ${paneId}\nCommand: ${params.command}${params.name ? `\nName: ${params.name}` : ""}`,
				}],
				details: { paneId, command: params.command, name: params.name },
			};
		},
	});

	// --- zellij_run_and_wait ---
	pi.registerTool({
		name: "zellij_run_and_wait",
		label: "Zellij Run & Wait",
		description:
			"Run a command in a new Zellij pane (split down in the current tab), block until it exits, then return its output. The pane closes automatically on completion. Like bash but in a visible pane with full observability.",
		promptSnippet: "Run command in Zellij pane (split in current tab), wait for exit, return output",
		promptGuidelines: [
			"Use zellij_run_and_wait when you need the result of a command but also want it visible in a pane (builds, tests, installs).",
		],
		parameters: Type.Object({
			command: Type.String({ description: "Command to run" }),
			name: Type.Optional(Type.String({ description: "Name for the pane" })),
			cwd: Type.Optional(Type.String({ description: "Working directory" })),
			timeout: Type.Optional(
				Type.Number({
					description:
						"Timeout in seconds (default: 120). Command is NOT killed on timeout, only stops waiting.",
				}),
			),
			direction: Type.Optional(
				StringEnum(["right", "down"] as const, {
					description: "Split direction (default: down — splits the current tab).",
				}),
			),
		}),

		async execute(_toolCallId, params, signal) {
			const timeout = (params.timeout ?? 120) * 1000;
			// Do NOT use --close-on-exit: we need to dump output before closing
			const args: string[] = ["action", "new-pane"];

			// Default: split down in current tab (not floating)
			args.push("--direction", params.direction ?? "down");

			if (params.name) {
				args.push("--name", params.name);
			}

			if (params.cwd) {
				args.push("--cwd", params.cwd);
			}

			// Always use /bin/sh for the wrapper — $SHELL may be fish, which does not
			// support (cmd) subshell syntax. /bin/sh is always POSIX-compatible.
			const marker = `/tmp/zellij-wait-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
			const wrappedCommand = `${params.command}; echo $? > ${marker}`;
			args.push("--", "/bin/sh", "-c", wrappedCommand);

			const createResult = await pi.exec("zellij", args, { signal, timeout: 10000 });

			if (createResult.code !== 0) {
				throw new Error(`zellij new-pane failed: ${createResult.stderr || createResult.stdout}`);
			}

			const paneId = createResult.stdout.trim();
			managedPanes.add(paneId);

			// Poll for completion
			const start = Date.now();
			let exitCode: number | null = null;

			while (Date.now() - start < timeout) {
				if (signal?.aborted) {
					return {
						content: [{ type: "text", text: `Cancelled. Pane ${paneId} may still be running.` }],
						details: { paneId, exitCode: null, timedOut: false, cancelled: true },
					};
				}

				const check = await pi.exec("cat", [marker], { timeout: 1000 });
				if (check.code === 0 && check.stdout.trim() !== "") {
					exitCode = parseInt(check.stdout.trim(), 10);
					break;
				}

				await sleep(500);
			}

			// Dump output before closing
			let output = "";
			try {
				const dump = await pi.exec(
					"zellij",
					["action", "dump-screen", "--pane-id", paneId, "--full"],
					{ timeout: 5000 },
				);
				output = dump.stdout;
			} catch {
				// Pane may have already closed
			}

			// Close pane then remove from tracking
			try {
				await pi.exec("zellij", ["action", "close-pane", "--pane-id", paneId], { timeout: 5000 });
			} catch {
				// May already be gone
			}
			managedPanes.delete(paneId);

			// Cleanup marker
			await pi.exec("rm", ["-f", marker], { timeout: 1000 });

			// Fix #6: use pi standard truncation
			const timedOut = exitCode === null;
			const truncation = truncateTail(output, {
				maxLines: DEFAULT_MAX_LINES,
				maxBytes: DEFAULT_MAX_BYTES,
			});

			const body = timedOut
				? `Timed out after ${params.timeout ?? 120}s. Pane ${paneId} may still be running.\n\nLast output:\n${truncation.content}`
				: `Exit code: ${exitCode}\n\n${truncation.content}`;

			return {
				content: [{ type: "text", text: body }],
				details: { paneId, exitCode, timedOut, totalLines: truncation.totalLines, truncated: truncation.truncated },
			};
		},
	});

	// --- zellij_pane_output ---
	pi.registerTool({
		name: "zellij_pane_output",
		label: "Zellij Pane Output",
		description:
			"Read the current viewport (and optionally full scrollback) of a Zellij pane. Use to check output of background processes.",
		promptSnippet: "Read output from a Zellij pane by ID",
		parameters: Type.Object({
			pane_id: Type.String({
				description: "Pane ID to read from (e.g. terminal_1, plugin_2, or bare integer like 3)",
			}),
			full_scrollback: Type.Optional(
				Type.Boolean({
					description: "Include full scrollback, not just viewport (default: false)",
				}),
			),
		}),

		async execute(_toolCallId, params, signal) {
			const args: string[] = ["action", "dump-screen", "--pane-id", params.pane_id];

			if (params.full_scrollback) {
				args.push("--full");
			}

			const result = await pi.exec("zellij", args, { signal, timeout: 10000 });

			if (result.code !== 0) {
				throw new Error(`zellij dump-screen failed: ${result.stderr || result.stdout}`);
			}

			// Fix #6: use pi standard truncation
			const truncation = truncateTail(result.stdout, {
				maxLines: DEFAULT_MAX_LINES,
				maxBytes: DEFAULT_MAX_BYTES,
			});

			return {
				content: [{
					type: "text",
					text: `Pane ${params.pane_id} output:\n${truncation.content}`,
				}],
				details: { paneId: params.pane_id, totalLines: truncation.totalLines, truncated: truncation.truncated },
			};
		},
	});

	// --- zellij_wait_for_output ---
	pi.registerTool({
		name: "zellij_wait_for_output",
		label: "Zellij Wait For Output",
		description:
			"Poll a Zellij pane until a regex pattern appears in its output, or until timeout. Useful for waiting until a server is ready, a build finishes, or a specific log line appears.",
		promptSnippet: "Wait until regex pattern appears in Zellij pane output",
		promptGuidelines: [
			'Use zellij_wait_for_output after zellij_run to wait for readiness signals (e.g. "listening on port", "build complete").',
		],
		parameters: Type.Object({
			pane_id: Type.String({ description: "Pane ID to watch" }),
			pattern: Type.String({
				description: "Regex pattern to match against pane output (case-insensitive)",
			}),
			timeout: Type.Optional(Type.Number({ description: "Timeout in seconds (default: 30)" })),
			poll_interval: Type.Optional(Type.Number({ description: "Poll interval in seconds (default: 1)" })),
		}),

		async execute(_toolCallId, params, signal) {
			const timeout = (params.timeout ?? 30) * 1000;
			const interval = (params.poll_interval ?? 1) * 1000;
			const start = Date.now();

			let regex: RegExp;
			try {
				regex = new RegExp(params.pattern, "i");
			} catch {
				throw new Error(`Invalid regex: ${params.pattern}`);
			}

			let lastOutput = "";

			while (Date.now() - start < timeout) {
				if (signal?.aborted) {
					return {
						content: [{ type: "text", text: `Cancelled while waiting for pattern "${params.pattern}" in pane ${params.pane_id}.` }],
						details: { paneId: params.pane_id, matched: false, cancelled: true },
					};
				}

				const dump = await pi.exec(
					"zellij",
					["action", "dump-screen", "--pane-id", params.pane_id, "--full"],
					{ timeout: 5000 },
				);

				if (dump.code !== 0) {
					throw new Error(`Pane ${params.pane_id} not available: ${dump.stderr || dump.stdout}`);
				}

				lastOutput = dump.stdout;
				const match = regex.exec(lastOutput);

				if (match) {
					const lines = lastOutput.split("\n");
					const matchLineIdx = lines.findIndex((l) => regex.test(l));
					const contextStart = Math.max(0, matchLineIdx - 2);
					const contextEnd = Math.min(lines.length, matchLineIdx + 5);
					const context = lines.slice(contextStart, contextEnd).join("\n");

					return {
						content: [{
							type: "text",
							text: `Pattern "${params.pattern}" matched in pane ${params.pane_id} after ${Math.round((Date.now() - start) / 1000)}s.\n\nContext:\n${context}`,
						}],
						details: {
							paneId: params.pane_id,
							matched: true,
							matchedText: match[0],
							elapsedMs: Date.now() - start,
						},
					};
				}

				await sleep(interval);
			}

			// Timed out — return last output tail
			const lines = lastOutput.split("\n");
			const tail = lines.slice(-20).join("\n");

			return {
				content: [{
					type: "text",
					text: `Timed out after ${params.timeout ?? 30}s waiting for "${params.pattern}" in pane ${params.pane_id}.\n\nLast 20 lines:\n${tail}`,
				}],
				details: {
					paneId: params.pane_id,
					matched: false,
					timedOut: true,
					elapsedMs: Date.now() - start,
				},
			};
		},
	});

	// --- zellij_close ---
	pi.registerTool({
		name: "zellij_close",
		label: "Zellij Close Pane",
		description: "Close a specific Zellij pane by ID. Cannot close the pane pi is running in.",
		promptSnippet: "Close a Zellij pane by ID",
		parameters: Type.Object({
			pane_id: Type.String({ description: "Pane ID to close (e.g. terminal_1)" }),
		}),

		async execute(_toolCallId, params, signal) {
			const paneId = normalisePaneId(params.pane_id);

			// Fix #3: self-pane protection
			if (ownPaneId && paneId === ownPaneId) {
				throw new Error(
					`Refusing to close pane ${paneId}: that is the pi session pane. Use a different pane ID.`,
				);
			}

			const result = await pi.exec(
				"zellij",
				["action", "close-pane", "--pane-id", paneId],
				{ signal, timeout: 5000 },
			);

			if (result.code !== 0) {
				throw new Error(`zellij close-pane failed: ${result.stderr || result.stdout}`);
			}

			managedPanes.delete(paneId);

			return {
				content: [{ type: "text", text: `Pane ${paneId} closed.` }],
				details: { paneId },
			};
		},
	});

	// --- zellij_focus ---
	pi.registerTool({
		name: "zellij_focus",
		label: "Zellij Focus Pane",
		description: "Switch focus to a specific Zellij pane by ID.",
		promptSnippet: "Focus a Zellij pane by ID",
		parameters: Type.Object({
			pane_id: Type.String({ description: "Pane ID to focus (e.g. terminal_1)" }),
		}),

		async execute(_toolCallId, params, signal) {
			const result = await pi.exec(
				"zellij",
				["action", "focus-pane-id", params.pane_id],
				{ signal, timeout: 5000 },
			);

			if (result.code !== 0) {
				throw new Error(`zellij focus-pane failed: ${result.stderr || result.stdout}`);
			}

			return {
				content: [{ type: "text", text: `Focused pane ${params.pane_id}.` }],
				details: { paneId: params.pane_id },
			};
		},
	});

	// --- Fix #2: zellij_send_keys ---
	pi.registerTool({
		name: "zellij_send_keys",
		label: "Zellij Send Keys",
		description:
			'Send keys or text to a Zellij pane. Use key names for control sequences (e.g. "Ctrl c", "Enter", "Escape") or write_chars for arbitrary text input.',
		promptSnippet: 'Send keys to a Zellij pane (e.g. "Ctrl c" to stop a process)',
		promptGuidelines: [
			'Use zellij_send_keys with "Ctrl c" to stop a running process in a managed pane instead of closing it.',
		],
		parameters: Type.Object({
			pane_id: Type.String({ description: "Pane ID to send keys to (e.g. terminal_1)" }),
			keys: Type.Optional(
				Type.String({
					description:
						'Key sequence to send (e.g. "Ctrl c", "Enter", "Escape", "Ctrl d"). Used for control sequences.',
				}),
			),
			text: Type.Optional(
				Type.String({
					description:
						"Arbitrary text to write to the pane (typed character by character). Use for sending commands or input.",
				}),
			),
		}),

		async execute(_toolCallId, params, signal) {
			if (!params.keys && !params.text) {
				throw new Error("Provide either keys or text.");
			}

			const results: string[] = [];

			if (params.keys) {
				// send-keys for control sequences
				const result = await pi.exec(
					"zellij",
					["action", "send-keys", "--pane-id", params.pane_id, params.keys],
					{ signal, timeout: 5000 },
				);
				if (result.code !== 0) {
					throw new Error(`zellij send-keys failed: ${result.stderr || result.stdout}`);
				}
				results.push(`Sent keys: "${params.keys}"`);
			}

			if (params.text) {
				// write-chars for arbitrary text
				const result = await pi.exec(
					"zellij",
					["action", "write-chars", "--pane-id", params.pane_id, params.text],
					{ signal, timeout: 5000 },
				);
				if (result.code !== 0) {
					throw new Error(`zellij write-chars failed: ${result.stderr || result.stdout}`);
				}
				results.push(`Wrote text: "${params.text}"`);
			}

			return {
				content: [{ type: "text", text: `Pane ${params.pane_id}: ${results.join(", ")}` }],
				details: { paneId: params.pane_id, keys: params.keys, text: params.text },
			};
		},
	});

	// --- Fix #5: zellij_rename_pane ---
	pi.registerTool({
		name: "zellij_rename_pane",
		label: "Zellij Rename Pane",
		description: "Rename a Zellij pane by ID.",
		promptSnippet: "Rename a Zellij pane by ID",
		parameters: Type.Object({
			pane_id: Type.String({ description: "Pane ID to rename (e.g. terminal_1)" }),
			name: Type.String({ description: "New name for the pane" }),
		}),

		async execute(_toolCallId, params, signal) {
			const result = await pi.exec(
				"zellij",
				["action", "rename-pane", "--pane-id", params.pane_id, params.name],
				{ signal, timeout: 5000 },
			);

			if (result.code !== 0) {
				throw new Error(`zellij rename-pane failed: ${result.stderr || result.stdout}`);
			}

			return {
				content: [{ type: "text", text: `Pane ${params.pane_id} renamed to "${params.name}".` }],
				details: { paneId: params.pane_id, name: params.name },
			};
		},
	});
}
