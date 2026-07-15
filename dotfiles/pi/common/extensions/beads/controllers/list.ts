import type { Keybinding, KeybindingsManager } from "@earendil-works/pi-tui";

export type ListIntent =
  | { type: "cancel" }
  | { type: "searchStart" }
  | { type: "searchCancel" }
  | { type: "searchApply" }
  | { type: "searchBackspace" }
  | { type: "searchAppend"; value: string }
  | { type: "moveSelection"; delta: number }
  | { type: "work" }
  | { type: "edit" }
  | { type: "toggleStatus" }
  | { type: "setPriority"; priority: string }
  | { type: "scrollDescription"; delta: number }
  | { type: "toggleType" }
  | { type: "create" }
  | { type: "insert" }
  | { type: "delegate" };

export interface ListControllerState {
  searching: boolean;
  filtered: boolean;
  allowSearch: boolean;
  allowPriority: boolean;
  closeKey: string;
  priorities: string[];
  priorityHotkeys?: Record<string, string>;
  keybindings: Pick<KeybindingsManager, "matches" | "getKeys">;
}

export type TaskMutationOutcome =
  | { kind: "busy" }
  | { kind: "succeeded" }
  | { kind: "failed"; error: unknown };

export class TaskMutationCoordinator {
  private readonly inFlight = new Set<string>();

  isInFlight(ref: string): boolean {
    return this.inFlight.has(ref);
  }

  async run(
    ref: string,
    persist: () => Promise<void>,
    onSuccess: () => void,
    onFailure: (error: unknown) => void
  ): Promise<TaskMutationOutcome> {
    if (this.inFlight.has(ref)) return { kind: "busy" };

    this.inFlight.add(ref);
    try {
      await persist();
      onSuccess();
      return { kind: "succeeded" };
    } catch (error) {
      onFailure(error);
      return { kind: "failed", error };
    } finally {
      this.inFlight.delete(ref);
    }
  }
}

type ShortcutContext = "default" | "search";

interface ShortcutDefinition {
  context: ShortcutContext;
  help?: string | ((state: ListControllerState) => string);
  showInHelp?: (state: ListControllerState) => boolean;
  match: (data: string, state: ListControllerState) => boolean;
  intent: (data: string, state: ListControllerState) => ListIntent;
}

function parsePriorityKey(
  data: string,
  priorities: string[],
  priorityHotkeys?: Record<string, string>
): string | null {
  if (data.length !== 1) return null;

  const hotkeyPriority = priorityHotkeys?.[data];
  if (hotkeyPriority && priorities.includes(hotkeyPriority)) return hotkeyPriority;

  const rank = parseInt(data, 10);
  if (isNaN(rank) || rank < 1 || rank > priorities.length) return null;
  return priorities[rank - 1] ?? null;
}

function buildPriorityHelpText(
  priorities: string[],
  priorityHotkeys?: Record<string, string>
): string {
  const hotkeyKeys = priorityHotkeys
    ? Object.keys(priorityHotkeys).sort((a, b) => a.localeCompare(b))
    : [];
  if (hotkeyKeys.length > 0) {
    return `${hotkeyKeys.join("/")} priority`;
  }

  if (priorities.length === 0) return "priority";
  if (priorities.length === 1) return "1 priority";
  return `1-${priorities.length} priority`;
}

function matchesAction(
  data: string,
  state: ListControllerState,
  action: Keybinding
): boolean {
  return state.keybindings.matches(data, action);
}

function displayKey(data: string): string {
  if (data.length === 1 && data.charCodeAt(0) >= 1 && data.charCodeAt(0) <= 26) {
    return `ctrl+${String.fromCharCode(data.charCodeAt(0) + 96)}`;
  }
  return data;
}

function actionKeyLabels(state: ListControllerState, action: Keybinding): string[] {
  const closeKeyLabel = displayKey(state.closeKey);
  return [...new Set(state.keybindings.getKeys(action))].filter((key) => key !== closeKeyLabel);
}

function actionKeys(state: ListControllerState, action: Keybinding): string {
  const keys = actionKeyLabels(state, action);
  return keys.length > 0 ? keys.join("/") : "(unbound)";
}

function combinedKeys(...keys: string[]): string {
  return [...new Set(keys)].join("/");
}

function isPrintable(data: string): boolean {
  return data.length === 1 && data.charCodeAt(0) >= 32 && data.charCodeAt(0) < 127;
}

const MOVE_KEYS: Record<string, number> = {
  w: -1,
  W: -1,
  s: 1,
  S: 1,
};

const SCROLL_KEYS: Record<string, number> = {
  j: 1,
  k: -1,
};

const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  {
    context: "search",
    match: (data, state) => data === state.closeKey,
    intent: () => ({ type: "cancel" }),
  },
  {
    context: "search",
    help: (state) => `${actionKeys(state, "tui.select.cancel")} cancel`,
    match: (data, state) => matchesAction(data, state, "tui.select.cancel"),
    intent: () => ({ type: "searchCancel" }),
  },
  {
    context: "search",
    help: (state) => `${actionKeys(state, "tui.select.confirm")} apply`,
    match: (data, state) => matchesAction(data, state, "tui.select.confirm"),
    intent: () => ({ type: "searchApply" }),
  },
  {
    context: "search",
    match: (data, state) => matchesAction(data, state, "tui.editor.deleteCharBackward"),
    intent: () => ({ type: "searchBackspace" }),
  },
  {
    context: "search",
    help: "type to search",
    match: (data) => isPrintable(data),
    intent: (data) => ({ type: "searchAppend", value: data }),
  },
  {
    context: "default",
    match: (data, state) => data === state.closeKey,
    intent: () => ({ type: "cancel" }),
  },
  {
    context: "default",
    help: (state) =>
      `${combinedKeys("w", ...actionKeyLabels(state, "tui.select.up"))} up • ${combinedKeys("s", ...actionKeyLabels(state, "tui.select.down"))} down`,
    match: (data, state) =>
      data in MOVE_KEYS ||
      matchesAction(data, state, "tui.select.up") ||
      matchesAction(data, state, "tui.select.down"),
    intent: (data, state) => ({
      type: "moveSelection",
      delta:
        data === "w" || data === "W" || matchesAction(data, state, "tui.select.up") ? -1 : 1,
    }),
  },
  {
    context: "default",
    help: (state) => `${actionKeys(state, "tui.select.confirm")} work`,
    match: (data, state) => matchesAction(data, state, "tui.select.confirm"),
    intent: () => ({ type: "work" }),
  },
  {
    context: "default",
    help: (state) => `${combinedKeys("e", ...actionKeyLabels(state, "tui.editor.cursorRight"))} edit`,
    match: (data, state) =>
      data === "e" || data === "E" || matchesAction(data, state, "tui.editor.cursorRight"),
    intent: () => ({ type: "edit" }),
  },
  {
    context: "default",
    help: (state) => buildPriorityHelpText(state.priorities, state.priorityHotkeys),
    showInHelp: (state) => state.allowPriority,
    match: (data, state) =>
      state.allowPriority &&
      parsePriorityKey(data, state.priorities, state.priorityHotkeys) !== null,
    intent: (data, state) => ({
      type: "setPriority",
      priority:
        parsePriorityKey(data, state.priorities, state.priorityHotkeys) ??
        state.priorities[0] ??
        "",
    }),
  },
  {
    context: "default",
    help: "f find",
    showInHelp: (state) => state.allowSearch,
    match: (data, state) => state.allowSearch && (data === "f" || data === "F"),
    intent: () => ({ type: "searchStart" }),
  },
  {
    context: "default",
    match: (data) => data === " ",
    intent: () => ({ type: "toggleStatus" }),
  },
  {
    context: "default",
    match: (data) => data in SCROLL_KEYS,
    intent: (data) => ({ type: "scrollDescription", delta: SCROLL_KEYS[data] ?? 1 }),
  },
  {
    context: "default",
    help: "t type",
    match: (data) => data === "t" || data === "T",
    intent: () => ({ type: "toggleType" }),
  },
  {
    context: "default",
    help: "c create",
    match: (data) => data === "c" || data === "C",
    intent: () => ({ type: "create" }),
  },
  {
    context: "default",
    help: (state) => `${actionKeys(state, "tui.input.tab")} insert`,
    match: (data, state) => matchesAction(data, state, "tui.input.tab"),
    intent: () => ({ type: "insert" }),
  },
];

export function resolveListIntent(data: string, state: ListControllerState): ListIntent {
  const context: ShortcutContext = state.searching ? "search" : "default";
  for (const shortcut of SHORTCUT_DEFINITIONS) {
    if (shortcut.context !== context) continue;
    if (shortcut.match(data, state)) return shortcut.intent(data, state);
  }
  return { type: "delegate" };
}

export function buildListPrimaryHelpText(state: ListControllerState): string {
  const context: ShortcutContext = state.searching ? "search" : "default";
  const parts = SHORTCUT_DEFINITIONS.filter((s) => s.context === context)
    .filter((s) => !!s.help)
    .filter((s) => (s.showInHelp ? s.showInHelp(state) : true))
    .map((s) => (typeof s.help === "function" ? s.help(state) : (s.help as string)));

  if (context === "default") {
    const cancelKeys = actionKeys(state, "tui.select.cancel");
    parts.push(state.filtered ? `${cancelKeys} clear filter` : `${cancelKeys} cancel`);
  }
  parts.push(`${displayKey(state.closeKey)} close`);

  return parts.join(" • ");
}

export function buildListSecondaryHelpText(): string {
  return "space status • j/k scroll";
}
