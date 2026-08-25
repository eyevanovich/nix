import { afterEach, describe, expect, mock, test } from "bun:test";

mock.module("@earendil-works/pi-coding-agent", () => ({
	DEFAULT_MAX_LINES: 2000,
	DEFAULT_MAX_BYTES: 50_000,
	truncateTail: (content: string) => ({
		content,
		totalLines: content.split("\n").length,
		truncated: false,
	}),
}));
mock.module("typebox", () => ({
	Type: {
		Object: (shape: unknown) => shape,
		String: (shape: unknown = {}) => shape,
		Optional: (shape: unknown) => shape,
		Boolean: (shape: unknown = {}) => shape,
		Number: (shape: unknown = {}) => shape,
	},
}));
mock.module("@earendil-works/pi-ai", () => ({
	StringEnum: (values: unknown) => values,
}));

const source = new URL("./index.ts", import.meta.url).href;
const originalZellij = process.env.ZELLIJ;

afterEach(() => {
	if (originalZellij === undefined) delete process.env.ZELLIJ;
	else process.env.ZELLIJ = originalZellij;
});

test("zellij_wait_for_output returns promptly when a non-matching pane exits", async () => {
	process.env.ZELLIJ = "test-session";
	const tools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
	const calls: string[] = [];
	const extension = (await import(`${source}?test=${Date.now()}`)).default;
	extension({
		on() {},
		registerTool(tool: { name: string; execute: (...args: any[]) => Promise<any> }) {
			tools.push(tool);
		},
		exec: async (command: string, args: string[]) => {
			calls.push(`${command} ${args.join(" ")}`);
			if (args[1] === "dump-screen") {
				return { code: 0, stdout: "build failed\n", stderr: "" };
			}
			if (args[1] === "list-panes") {
				return {
					code: 0,
					stdout: JSON.stringify([{ id: 17, is_plugin: false, exited: true, exit_status: 1 }]),
					stderr: "",
				};
			}
			throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
		},
	});

	const tool = tools.find((candidate) => candidate.name === "zellij_wait_for_output");
	expect(tool).toBeDefined();
	const result = await tool!.execute("test", {
		pane_id: "terminal_17",
		pattern: "build complete",
		timeout: 0.01,
		poll_interval: 0,
	});

	expect(result.details).toMatchObject({
		paneId: "terminal_17",
		matched: false,
		paneExited: true,
		exitCode: 1,
	});
	expect(calls).toContain("zellij action list-panes --json");
});

test("zellij_run creates work in a new tab and restores the active tab", async () => {
	process.env.ZELLIJ = "test-session";
	const tools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
	const calls: string[] = [];
	const extension = (await import(`${source}?test=${Date.now()}`)).default;
	extension({
		on() {},
		registerTool(tool: { name: string; execute: (...args: any[]) => Promise<any> }) {
			tools.push(tool);
		},
		exec: async (command: string, args: string[]) => {
			calls.push(`${command} ${args.join(" ")}`);
			if (args.join(" ") === "action list-tabs --json") {
				return { code: 0, stdout: '[{"tab_id":2,"active":true,"name":"main"}]', stderr: "" };
			}
			if (args[1] === "new-tab") return { code: 0, stdout: "7\n", stderr: "" };
			if (args.join(" ") === "action list-panes --json") {
				return {
					code: 0,
					stdout: '[{"id":17,"tab_id":7,"is_plugin":false,"exited":false}]',
					stderr: "",
				};
			}
			if (args.join(" ") === "action go-to-tab-by-id 2") return { code: 0, stdout: "", stderr: "" };
			throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
		},
	});

	const tool = tools.find((candidate) => candidate.name === "zellij_run");
	expect(tool).toBeDefined();
	const result = await tool!.execute("test", { command: "npm test", name: "tests" });

	expect(result.details).toMatchObject({ paneId: "terminal_17", tabId: 7 });
	expect(calls).toContain("zellij action new-tab --name tests -- /bin/sh -c npm test");
	expect(calls).toContain("zellij action go-to-tab-by-id 2");
});

test("zellij_run_and_wait creates work in a new tab before waiting", async () => {
	process.env.ZELLIJ = "test-session";
	const tools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
	const calls: string[] = [];
	const extension = (await import(`${source}?test=${Date.now()}`)).default;
	extension({
		on() {},
		registerTool(tool: { name: string; execute: (...args: any[]) => Promise<any> }) {
			tools.push(tool);
		},
		exec: async (command: string, args: string[]) => {
			calls.push(`${command} ${args.join(" ")}`);
			if (args.join(" ") === "action list-tabs --json") {
				return { code: 0, stdout: '[{"tab_id":2,"active":true,"name":"main"}]', stderr: "" };
			}
			if (args[1] === "new-tab") return { code: 0, stdout: "7\n", stderr: "" };
			if (args.join(" ") === "action list-panes --json") {
				return {
					code: 0,
					stdout: '[{"id":17,"tab_id":7,"is_plugin":false,"exited":false}]',
					stderr: "",
				};
			}
			if (args.join(" ") === "action go-to-tab-by-id 2") return { code: 0, stdout: "", stderr: "" };
			throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
		},
	});

	const tool = tools.find((candidate) => candidate.name === "zellij_run_and_wait");
	expect(tool).toBeDefined();
	const controller = new AbortController();
	controller.abort();
	const result = await tool!.execute("test", { command: "npm test", name: "tests" }, controller.signal);

	expect(result.details).toMatchObject({ paneId: "terminal_17", cancelled: true });
	expect(calls.some((call) => call.startsWith("zellij action new-tab --name tests -- /bin/sh -c npm test; echo $? >"))).toBe(true);
	expect(calls).toContain("zellij action go-to-tab-by-id 2");
});
