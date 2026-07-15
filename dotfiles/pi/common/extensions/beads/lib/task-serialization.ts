import type { Task } from "../models/task.ts";
import { toKebabCase } from "../models/task.ts";
import { buildTaskContext } from "./task-context.ts";

export function serializeTask(task: Task): string {
  const parts = [
    `title="${task.title}"`,
    `status=${toKebabCase(task.status)}`,
    `priority=${task.priority ?? "unknown"}`,
    `type=${task.taskType || "task"}`,
  ];

  if (task.id) {
    parts.unshift(`id=${task.id}`);
  }

  const description = task.description?.trim();
  if (description) {
    parts.push(`description="${description.replaceAll("\n", "\\n")}"`);
  }

  if (task.dueAt) {
    parts.push(`due="${task.dueAt}"`);
  }

  return `task(${parts.join(", ")})`;
}

export function buildTaskWorkPrompt(task: Task): string {
  const identity = task.id ?? task.ref;
  const lines = [`Work on task ${identity}: ${task.title}`];

  if (task.blockedBy?.length) {
    lines.push(
      "",
      `WARNING: This task is actively blocked by ${task.blockedBy.map(({ ref }) => ref).join(", ")}. Resolve or account for these blockers before proceeding.`
    );
  }

  for (const field of buildTaskContext(task)) {
    if (field.key === "id") continue;
    lines.push("", field.multiline ? `${field.label}:\n${field.value}` : `${field.label}: ${field.value}`);
  }

  return lines.join("\n");
}
