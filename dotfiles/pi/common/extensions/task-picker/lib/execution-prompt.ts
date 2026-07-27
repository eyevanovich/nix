import { readFile } from "node:fs/promises";
import { join } from "node:path";

const EXECUTION_COMMANDS = new Set(["execute-beads", "execute-gitlab-issue"]);

function promptBody(source: string, name: string): string {
  const match = source.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error(`Bundled execution prompt ${name} has invalid frontmatter`);
  return match[1]!.trim();
}

export async function expandBundledExecutionPrompt(
  command: string,
  promptsDir: string
): Promise<string> {
  const match = command.match(/^\/([a-z0-9-]+)(?:\s+([\s\S]*))?$/);
  const name = match?.[1];
  if (!name || !EXECUTION_COMMANDS.has(name)) {
    throw new Error(`Unsupported bundled execution command: ${command}`);
  }

  const args = match[2] ?? "";
  const source = await readFile(join(promptsDir, `${name}.md`), "utf8");
  return promptBody(source, name).replace(/\$(?:ARGUMENTS|@)/g, () => args);
}
