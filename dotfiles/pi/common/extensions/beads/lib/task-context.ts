import type { Task, TaskDependency } from "../models/task.ts";
import { toKebabCase } from "../models/task.ts";

export type TaskContextKey =
  | "id"
  | "status"
  | "blockers"
  | "dependencies"
  | "priority"
  | "type"
  | "assignee"
  | "owner"
  | "labels"
  | "due"
  | "description"
  | "acceptanceCriteria"
  | "design"
  | "notes";

export interface TaskContextField {
  key: TaskContextKey;
  label: string;
  value: string;
  multiline?: boolean;
}

function dependencyText(dependency: TaskDependency): string {
  const details = [dependency.title, dependency.status].filter(
    (value): value is string => Boolean(value?.trim())
  );
  const suffix = details.length ? ` (${details.join("; ")})` : "";
  const type = dependency.dependencyType ? ` [${dependency.dependencyType}]` : "";
  return `${dependency.ref}${suffix}${type}`;
}

function add(
  fields: TaskContextField[],
  key: TaskContextKey,
  label: string,
  value: string | undefined,
  multiline = false
): void {
  const normalized = value?.trim();
  if (!normalized) return;
  const field: TaskContextField = { key, label, value: normalized };
  if (multiline) field.multiline = true;
  fields.push(field);
}

export function buildTaskContext(task: Task): TaskContextField[] {
  const fields: TaskContextField[] = [];
  const blockedRefs = new Set(task.blockedBy?.map(({ ref }) => ref));
  const otherDependencies = task.dependencies?.filter(({ ref }) => !blockedRefs.has(ref));

  add(fields, "id", "ID", task.id ?? task.ref);
  add(fields, "status", "Status", toKebabCase(task.status));
  add(fields, "blockers", "Active blockers", task.blockedBy?.map(dependencyText).join(", "));
  add(
    fields,
    "dependencies",
    "Dependencies",
    otherDependencies?.map(dependencyText).join(", ")
  );
  add(fields, "priority", "Priority", task.priority);
  add(fields, "type", "Type", task.taskType);
  add(fields, "assignee", "Assignee", task.assignee);
  add(fields, "owner", "Owner", task.owner);
  add(fields, "labels", "Labels", task.labels?.join(", "));
  add(fields, "due", "Due", task.dueAt);
  add(fields, "description", "Description", task.description, true);
  add(fields, "acceptanceCriteria", "Acceptance criteria", task.acceptanceCriteria, true);
  add(fields, "design", "Design", task.design, true);
  add(fields, "notes", "Notes", task.notes, true);

  return fields;
}
