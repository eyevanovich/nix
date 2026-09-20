import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  initTheme,
  SessionManager,
  UserMessageComponent,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type MarkdownTransformer,
  type RegisteredCommand,
} from "@earendil-works/pi-coding-agent";
import registerExtension, { dispatchTaskWork } from "../extension.ts";
import { expandBundledExecutionPrompt } from "../lib/execution-prompt.ts";

const promptsDir = fileURLToPath(new URL("../prompts", import.meta.url));
initTheme("dark", false);

function harness(session = SessionManager.inMemory("/repo"), supportsDisplay = true) {
  const commands = new Map<string, Omit<RegisteredCommand, "name" | "sourceInfo">>();
  const transformers: MarkdownTransformer[] = [];
  const editors: Array<{ title: string; text: string }> = [];
  const selections: string[][] = [];
  const notifications: string[] = [];
  let selectedIndex: number | undefined = 0;
  let editorResult: string | undefined = "These edits must be discarded";
  const api = {
    on() {},
    registerShortcut() {},
    registerCommand(name: string, command: Omit<RegisteredCommand, "name" | "sourceInfo">) {
      commands.set(name, command);
    },
    ...(supportsDisplay ? {
      registerMarkdownTransformer(transformer: MarkdownTransformer) { transformers.push(transformer); },
    } : {}),
    sendUserMessage() { assert.fail("Inspection must not send a user message"); },
    sendMessage() { assert.fail("Inspection must not send a model-visible message"); },
    appendEntry() { assert.fail("Inspection must not mutate the session"); },
  } as unknown as ExtensionAPI;
  registerExtension(api, { providers: [] });
  const ctx = {
    mode: "tui",
    hasUI: true,
    sessionManager: session,
    ui: {
      notify(message: string) { notifications.push(message); },
      async select(_title: string, choices: string[]) {
        selections.push(choices);
        return selectedIndex === undefined ? undefined : choices[selectedIndex];
      },
      async editor(title: string, text: string) {
        editors.push({ title, text });
        return editorResult;
      },
    },
  } as unknown as ExtensionCommandContext;
  return {
    session, commands, transformers, editors, selections, notifications, ctx,
    select(index: number | undefined) { selectedIndex = index; },
    cancelEditor() { editorResult = undefined; },
    transform(text: string, messageType: "user" | "assistant" | "assistant-thinking" = "user") {
      assert.equal(transformers.length, 1);
      return transformers[0]!(text, { messageType, isStreaming: false, availableWidth: 80 });
    },
    async inspect() {
      const command = commands.get("task-prompt");
      assert.ok(command, "task-prompt command registered");
      await command.handler("", ctx);
    },
  };
}

function append(session: SessionManager, text: string) {
  return session.appendMessage({ role: "user", content: [{ type: "text", text }], timestamp: 0 });
}

for (const command of ["execute-beads", "execute-gitlab-issue"]) {
  test(`${command}: picker sends full instructions while Pi renders a compact summary`, async () => {
    for (const idle of [true, false]) {
      const runtime = harness();
      let sent = "";
      let options: unknown;
      await dispatchTaskWork(`/${command} test-target`, (text, sendOptions) => {
        sent = text;
        options = sendOptions;
      }, idle);
      assert.match(sent, /Implementation requires approval/);
      assert.deepEqual(options, idle ? undefined : { deliverAs: "followUp" });
      append(runtime.session, sent);
      const before = structuredClone(runtime.session.buildSessionContext());
      const display = new UserMessageComponent(sent, undefined, 1, runtime.transformers).render(80).join("\n");
      assert.match(display, new RegExp(command));
      assert.match(display, /test-target/);
      assert.match(display, /task-prompt/);
      assert.doesNotMatch(display, /Implementation requires approval|## Plan/);
      assert.ok(display.length < sent.length / 2);
      assert.deepEqual(runtime.session.buildSessionContext(), before);
      await runtime.inspect();
      assert.equal(runtime.editors[0]?.text, sent);
    }
  });

  test(`${command}: the manual prompt template carries the same display marker`, async () => {
    const source = await readFile(`${promptsDir}/${command}.md`, "utf8");
    const manual = source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").replace("$ARGUMENTS", "test-target");
    const picker = await expandBundledExecutionPrompt(`/${command} test-target`, promptsDir);
    const runtime = harness();
    assert.match(manual, /^<!-- task-picker:/);
    assert.equal(runtime.transform(manual), runtime.transform(picker));
    assert.match(runtime.transform(manual), /task-prompt/);
  });
}

test("only complete marked user prompts are condensed", async () => {
  const text = await expandBundledExecutionPrompt("/execute-beads test-target", promptsDir);
  const runtime = harness();
  for (const other of [
    "Ordinary user text",
    text.replace(/^<!--[^\n]+-->\n/, ""),
    `Here is an example:\n${text}`,
    `${text}\nPlease explain this workflow instead.`,
    `${text}\nAdditional instructions\n<target>\nother\n</target>`,
    `${text}\n${text}`,
    `\`\`\`markdown\n${text}\n\`\`\``,
    text.replace("</target>", ""),
    text.replace("task-picker:execute-beads:v1", "task-picker:other:v1"),
    text.replace("task-picker:execute-beads:v1", "task-picker:execute-beads:v2"),
  ]) assert.equal(runtime.transform(other), other);
  assert.equal(runtime.transform(text, "assistant"), text);
  assert.equal(runtime.transform(text, "assistant-thinking"), text);
  assert.equal(runtime.transform(text.replace(/\n/g, "\r\n")), runtime.transform(text));
});

test("summary targets are bounded and sanitized without altering the inspectable prompt", async () => {
  const target = "a`b\n\u001b[31m\u202e" + "long ".repeat(100);
  const text = await expandBundledExecutionPrompt(`/execute-beads ${target}`, promptsDir);
  const runtime = harness();
  const display = runtime.transform(text);
  assert.ok(display.length < 400);
  assert.doesNotMatch(display, /[\u001b\u202e]/);
  append(runtime.session, text);
  const before = structuredClone(runtime.session.getEntries());
  await runtime.inspect();
  assert.equal(runtime.editors[0]?.text, text);
  assert.match(runtime.editors[0]?.title ?? "", /edits discarded/i);
  assert.deepEqual(runtime.session.getEntries(), before);
  runtime.cancelEditor();
  await runtime.inspect();
  assert.deepEqual(runtime.session.getEntries(), before);
});

test("inspection chooses among current-branch prompts and cancellation changes nothing", async () => {
  const runtime = harness();
  const first = await expandBundledExecutionPrompt("/execute-beads same-target", promptsDir);
  const second = first.replace("Report decisions", "Report task decisions");
  const firstId = append(runtime.session, first);
  append(runtime.session, second);
  const before = structuredClone(runtime.session.getEntries());
  runtime.select(undefined);
  await runtime.inspect();
  assert.equal(runtime.editors.length, 0);
  assert.equal(new Set(runtime.selections[0]).size, 2);
  assert.deepEqual(runtime.session.getEntries(), before);
  runtime.select(1);
  await runtime.inspect();
  assert.equal(runtime.editors[0]?.text, first);
  runtime.session.branch(firstId);
  const reloaded = harness(runtime.session);
  await reloaded.inspect();
  assert.equal(reloaded.selections.length, 0);
  assert.equal(reloaded.editors[0]?.text, first);
  runtime.session.newSession();
  const empty = harness(runtime.session);
  await empty.inspect();
  assert.equal(empty.editors.length, 0);
  assert.match(empty.notifications[0] ?? "", /no.*prompt/i);
});

test("inspection supports string content and ignores non-user messages", async () => {
  const runtime = harness();
  const text = await expandBundledExecutionPrompt("/execute-beads", promptsDir);
  runtime.session.appendCustomMessageEntry("example", text, true);
  await runtime.inspect();
  assert.equal(runtime.editors.length, 0);
  runtime.session.appendMessage({ role: "user", content: text, timestamp: 0 });
  await runtime.inspect();
  assert.equal(runtime.editors[0]?.text, text);
});

test("non-TUI inspection does not open a viewer", async () => {
  for (const mode of ["rpc", "print", "json"] as const) {
    const runtime = harness();
    Object.assign(runtime.ctx, { mode, hasUI: mode === "rpc" });
    await runtime.inspect();
    assert.equal(runtime.editors.length, 0);
    assert.equal(runtime.notifications.length, mode === "rpc" ? 1 : 0);
  }
});

test("older Pi APIs retain the original fully visible prompt path", () => {
  const runtime = harness(undefined, false);
  assert.equal(runtime.transformers.length, 0);
  assert.equal(runtime.commands.has("task-prompt"), false);
});
