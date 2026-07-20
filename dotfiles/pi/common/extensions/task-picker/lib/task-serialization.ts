import type { Task } from "../models/task.ts";
import { toKebabCase } from "../models/task.ts";
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
