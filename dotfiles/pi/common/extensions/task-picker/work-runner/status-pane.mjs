import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const exec = promisify(execFile);
const recordPath = process.env.TASK_PICKER_RUN_FILE;
const refreshMs = 3_000;

if (!recordPath) {
  console.error("TASK_PICKER_RUN_FILE is not set");
  process.exit(1);
}

function clean(value) {
  return String(value ?? "").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}

function limited(text, maxLines = 20) {
  const lines = clean(text).split(/\r?\n/).filter(Boolean);
  if (lines.length <= maxLines) return lines.join("\n") || "(none)";
  return `${lines.slice(0, maxLines).join("\n")}\n… ${lines.length - maxLines} more lines`;
}

async function command(file, args, cwd) {
  try {
    const { stdout, stderr } = await exec(file, args, {
      cwd,
      encoding: "utf8",
      timeout: 10_000,
      maxBuffer: 256 * 1024,
    });
    return limited(stdout || stderr);
  } catch (error) {
    const output = error?.stdout || error?.stderr;
    return output ? limited(output) : clean(error?.message || error);
  }
}

async function render() {
  let record;
  try {
    record = JSON.parse(await readFile(recordPath, "utf8"));
  } catch (error) {
    process.stdout.write(`\x1b[2J\x1b[Htask-picker status\n\n${clean(error?.message || error)}\n`);
    return;
  }

  const lines = [
    `Task:     ${clean(record.taskRef)}`,
    `Run:      ${clean(record.id)}`,
    `Phase:    ${clean(record.phase)}`,
    `Branch:   ${clean(record.branch)}`,
    `Worktree: ${clean(record.leasePath || "allocating")}`,
    `Updated:  ${clean(record.updatedAt)}`,
  ];
  if (record.prUrl) lines.push(`Review:   ${clean(record.prUrl)}`);
  if (record.summary) lines.push(`Summary:  ${clean(record.summary)}`);
  if (record.error) lines.push(`Error:    ${clean(record.error)}`);

  let gitStatus = "(worktree not allocated)";
  let validationStatus = "(validation not started)";
  if (record.leasePath) {
    [gitStatus, validationStatus] = await Promise.all([
      command("git", ["status", "--short", "--branch"], record.leasePath),
      command("no-mistakes", ["axi", "status"], record.leasePath),
    ]);
  }

  process.stdout.write(
    `\x1b[2J\x1b[H${lines.join("\n")}\n\nGit\n${gitStatus}\n\nno-mistakes\n${validationStatus}\n`
  );
}

while (true) {
  await render();
  await new Promise((resolve) => setTimeout(resolve, refreshMs));
}
