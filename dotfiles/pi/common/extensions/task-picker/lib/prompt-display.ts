import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

interface ExecutionPrompt {
  text: string;
  label: string;
}

function executionPrompt(text: string): ExecutionPrompt | undefined {
  const match = text.match(
    /^<!-- task-picker:(execute-beads|execute-gitlab-issue):v1 -->\r?\n[\s\S]+\r?\n<target>\r?\n([\s\S]*?)\r?\n<\/target>\s*$/
  );
  if (!match || text.match(/<\/?target>/g)?.length !== 2) return;

  const target = match[2]!
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const shortTarget = target.length > 160 ? `${target.slice(0, 160)}…` : target;
  return { text, label: `/${match[1]}${shortTarget ? ` ${shortTarget}` : ""}` };
}

function codeSpan(text: string): string {
  const width = (text.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0) + 1;
  const delimiter = "`".repeat(width);
  return `${delimiter} ${text} ${delimiter}`;
}

export function registerExecutionPromptDisplay(pi: ExtensionAPI): void {
  if (typeof pi.registerMarkdownTransformer !== "function") return;

  pi.registerMarkdownTransformer((markdown, context) => {
    if (context.messageType !== "user") return markdown;
    const prompt = executionPrompt(markdown);
    if (!prompt) return markdown;
    return `**Task workflow**\n\n${codeSpan(prompt.label)}\n\nInstructions hidden · View with \`/task-prompt\`.`;
  });

  pi.registerCommand("task-prompt", {
    description: "Inspect a task workflow prompt from the current session branch",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") {
        if (ctx.hasUI) ctx.ui.notify("Task prompt inspection requires Pi TUI mode.", "info");
        return;
      }

      const prompts: ExecutionPrompt[] = [];
      for (const entry of ctx.sessionManager.getBranch()) {
        if (entry.type !== "message" || entry.message.role !== "user") continue;
        const content = entry.message.content;
        const texts = typeof content === "string"
          ? [content]
          : content.flatMap((block) => block.type === "text" ? [block.text] : []);
        for (const text of texts) {
          const prompt = executionPrompt(text);
          if (prompt) prompts.push(prompt);
        }
      }
      prompts.reverse();
      if (prompts.length === 0) {
        ctx.ui.notify("No task workflow prompts in this session branch. Queued prompts appear after delivery.", "info");
        return;
      }

      let selected = prompts[0]!;
      if (prompts.length > 1) {
        const choices = prompts.map((prompt, index) => `${index + 1}. ${prompt.label}`);
        const choice = await ctx.ui.select("Inspect task prompt (newest first)", choices);
        if (choice === undefined) return;
        const prompt = prompts[choices.indexOf(choice)];
        if (!prompt) return;
        selected = prompt;
      }
      await ctx.ui.editor("View prompt — edits discarded", selected.text);
    },
  });
}
